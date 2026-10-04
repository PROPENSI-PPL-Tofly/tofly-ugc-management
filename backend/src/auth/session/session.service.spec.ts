import type { Response } from 'express';
import {
  AppSessionService,
  type SessionRepository,
} from './session.service.js';
import type { Principal } from '../google/ports.js';

const CREATOR: Principal = {
  userId: 'user-1',
  role: 'creator',
  creatorId: 'creator-1',
};

const NOW = new Date('2026-09-27T00:00:00.000Z');
const IDLE_MS = 30 * 60 * 1000;
const ABSOLUTE_MS = 12 * 60 * 60 * 1000;

const CORRUPTED_SESSIONS: Array<
  [string, (row: Record<string, unknown>) => void]
> = [
  [
    'missing hash',
    (row) => {
      row.idHash = undefined;
    },
  ],
  [
    'missing user id',
    (row) => {
      row.userId = undefined;
    },
  ],
  [
    'admin with creator id',
    (row) => {
      row.role = 'admin';
      row.creatorId = 'creator-1';
    },
  ],
  [
    'creator without creator id',
    (row) => {
      row.creatorId = null;
    },
  ],
  [
    'invalid idle expiration',
    (row) => {
      row.idleExpiresAt = 'later';
    },
  ],
  [
    'invalid absolute expiration',
    (row) => {
      row.absoluteExpiresAt = 'later';
    },
  ],
];

function repository(): SessionRepository & {
  records: Map<string, Record<string, unknown>>;
} {
  const records = new Map<string, Record<string, unknown>>();

  return {
    records,
    create: vi.fn(async (args: Parameters<SessionRepository['create']>[0]) => {
      records.set(
        args.data.idHash,
        args.data as unknown as Record<string, unknown>,
      );
      return args.data;
    }),
    findUnique: vi.fn(
      async (args: Parameters<SessionRepository['findUnique']>[0]) =>
        records.get(args.where.idHash) ?? null,
    ),
    update: vi.fn(async (args: Parameters<SessionRepository['update']>[0]) => {
      const current = records.get(args.where.idHash);

      if (!current) {
        throw new Error('session not found');
      }

      const updated = { ...current, ...args.data };
      records.set(args.where.idHash, updated);

      return updated;
    }),
    deleteMany: vi.fn(
      async (args: Parameters<SessionRepository['deleteMany']>[0]) => ({
        count: Number(records.delete(args.where.idHash)),
      }),
    ),
  };
}

function response(): Response & {
  cookie: ReturnType<typeof vi.fn>;
  clearCookie: ReturnType<typeof vi.fn>;
} {
  return {
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  } as unknown as Response & {
    cookie: ReturnType<typeof vi.fn>;
    clearCookie: ReturnType<typeof vi.fn>;
  };
}

describe('AppSessionService', () => {
  let store: ReturnType<typeof repository>;
  let sessions: AppSessionService;
  let currentTime: Date;

  beforeEach(() => {
    store = repository();
    currentTime = new Date(NOW);

    sessions = new AppSessionService(store, {
      idleTimeoutMs: IDLE_MS,
      absoluteLifetimeMs: ABSOLUTE_MS,
      now: () => new Date(currentTime),
    });
  });

  it('creates a new opaque session after sign-in and only stores its hash', async () => {
    const first = await sessions.start(response(), CREATOR);
    const second = await sessions.start(response(), CREATOR);

    expect(first.id).not.toBe(second.id);
    expect(first.id).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect([...store.records.keys()]).not.toContain(first.id);

    expect(store.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: CREATOR.userId,
        creatorId: CREATOR.creatorId,
        role: CREATOR.role,
        idleExpiresAt: new Date(NOW.getTime() + IDLE_MS),
        absoluteExpiresAt: new Date(NOW.getTime() + ABSOLUTE_MS),
      }),
    });
  });

  it('stores and resolves an admin principal without a creator identity', async () => {
    const admin: Principal = { userId: 'admin-1', role: 'admin' };
    const { id } = await sessions.start(response(), admin);

    await expect(sessions.authenticate(id)).resolves.toEqual(admin);
    expect([...store.records.values()][0]).toMatchObject({
      userId: 'admin-1',
      role: 'admin',
      creatorId: null,
    });
  });

  it('sets an httpOnly, secure, host-only Lax cookie in production', async () => {
    const reply = response();

    await sessions.start(reply, CREATOR);

    expect(reply.cookie).toHaveBeenCalledWith(
      '__session',
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: IDLE_MS,
      }),
    );

    expect(reply.cookie.mock.calls[0][2]).not.toHaveProperty('domain');
  });

  it('authenticates a valid opaque cookie and renews idle expiry', async () => {
    const { id } = await sessions.start(response(), CREATOR);
    const reply = response();

    currentTime = new Date(NOW.getTime() + 5 * 60 * 1000);

    await expect(sessions.authenticate(id, reply)).resolves.toMatchObject(
      CREATOR,
    );

    expect(store.update).toHaveBeenCalledWith({
      where: { idHash: expect.any(String) },
      data: {
        idleExpiresAt: new Date(NOW.getTime() + 5 * 60 * 1000 + IDLE_MS),
      },
    });

    expect(reply.cookie).toHaveBeenCalledWith(
      '__session',
      id,
      expect.objectContaining({
        maxAge: IDLE_MS,
      }),
    );
  });

  it('can authenticate without a response when cookie renewal is not requested', async () => {
    const { id } = await sessions.start(response(), CREATOR);

    await expect(sessions.authenticate(id)).resolves.toEqual(CREATOR);
  });

  it('rejects a missing, malformed, empty, or non-canonical session before storage lookup', async () => {
    const cases: Array<[string, unknown]> = [
      ['a missing session', undefined],
      ['a malformed session', 'not-a-session-id'],
      ['an empty session', ''],
      ['a non-canonical base64url session', 'B'.repeat(43)],
    ];

    for (const [_label, id] of cases) {
      await expect(sessions.authenticate(id)).resolves.toBeNull();
    }

    expect(store.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a well-formed ID that has no server-side session', async () => {
    await expect(sessions.authenticate('A'.repeat(43))).resolves.toBeNull();

    expect(store.findUnique).toHaveBeenCalledWith({
      where: { idHash: expect.any(String) },
    });
  });

  it('does not trust an invalid persisted principal', async () => {
    const { id } = await sessions.start(response(), CREATOR);
    const record = [...store.records.values()][0];
    record.role = 'unknown';

    await expect(sessions.authenticate(id)).resolves.toBeNull();
  });

  it.each(CORRUPTED_SESSIONS)(
    'rejects a persisted session with %s',
    async (_label, corrupt) => {
      const { id } = await sessions.start(response(), CREATOR);
      corrupt([...store.records.values()][0]);

      await expect(sessions.authenticate(id)).resolves.toBeNull();
    },
  );

  it('rejects and deletes an expired idle session', async () => {
    const { id } = await sessions.start(response(), CREATOR);
    const record = [...store.records.values()][0];

    record.idleExpiresAt = new Date(NOW.getTime() - 1);

    await expect(sessions.authenticate(id)).resolves.toBeNull();

    expect(store.deleteMany).toHaveBeenCalledWith({
      where: { idHash: expect.any(String) },
    });
  });

  it('rejects an idle session past its absolute lifetime without extending it', async () => {
    const { id } = await sessions.start(response(), CREATOR);
    const record = [...store.records.values()][0];

    record.idleExpiresAt = new Date(NOW.getTime() + IDLE_MS);
    record.absoluteExpiresAt = new Date(NOW.getTime() - 1);

    await expect(sessions.authenticate(id)).resolves.toBeNull();

    expect(store.update).not.toHaveBeenCalled();
  });

  it('caps sliding expiry and cookie renewal at the absolute expiration', async () => {
    const { id } = await sessions.start(response(), CREATOR);
    const reply = response();
    const record = [...store.records.values()][0];

    record.idleExpiresAt = new Date(NOW.getTime() + ABSOLUTE_MS);

    currentTime = new Date(
      NOW.getTime() + 11 * 60 * 60 * 1000 + 45 * 60 * 1000,
    );

    await expect(sessions.authenticate(id, reply)).resolves.toMatchObject(
      CREATOR,
    );

    expect(store.update).toHaveBeenCalledWith({
      where: { idHash: expect.any(String) },
      data: {
        idleExpiresAt: new Date(NOW.getTime() + ABSOLUTE_MS),
      },
    });

    expect(reply.cookie).toHaveBeenCalledWith(
      expect.any(String),
      id,
      expect.objectContaining({
        maxAge: 15 * 60 * 1000,
      }),
    );
  });

  it('revokes a session and makes its previous cookie unusable', async () => {
    const { id } = await sessions.start(response(), CREATOR);

    await sessions.logout(id, response());

    await expect(sessions.authenticate(id)).resolves.toBeNull();

    expect(store.deleteMany).toHaveBeenCalledWith({
      where: { idHash: expect.any(String) },
    });
  });

  it('clears the browser cookie on logout', async () => {
    const { id } = await sessions.start(response(), CREATOR);
    const reply = response();

    await sessions.logout(id, reply);

    expect(reply.clearCookie).toHaveBeenCalledWith(
      '__session',
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
      }),
    );
  });

  it('clears the cookie without querying storage for a malformed ID', async () => {
    const reply = response();

    await sessions.logout('malformed', reply);

    expect(store.deleteMany).not.toHaveBeenCalled();
    expect(reply.clearCookie).toHaveBeenCalledWith(
      '__session',
      expect.objectContaining({
        path: '/',
        httpOnly: true,
      }),
    );
  });

  it('uses the system clock when no test clock is supplied', async () => {
    const realClock = new AppSessionService(store, {
      idleTimeoutMs: IDLE_MS,
      absoluteLifetimeMs: ABSOLUTE_MS,
    });

    await expect(realClock.start(response(), CREATOR)).resolves.toMatchObject({
      id: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    });
  });

  it('returns the configured session cookie name', () => {
    expect(sessions.cookieName()).toBe('__session');
  });

  it('fails closed when session storage is unavailable', async () => {
    store.findUnique = vi.fn().mockRejectedValue(new Error('database offline'));

    const result = await sessions.authenticate('A'.repeat(43)).then(
      (principal) => ({
        kind: 'principal' as const,
        principal,
      }),
      (error: unknown) => ({
        kind: 'error' as const,
        error,
      }),
    );

    expect(result).toMatchObject({
      kind: 'error',
      error: {
        message: 'database offline',
      },
    });

    // The service contract rejects on storage failure;
    // no Principal is returned or trusted.
    expect(result).not.toHaveProperty('principal');
  });

  it('does not put OAuth credentials into the application cookie', async () => {
    const reply = response();

    await sessions.start(reply, CREATOR);

    const [, value] = reply.cookie.mock.calls[0];

    expect(value).not.toContain('google-access-token');
    expect(value).not.toContain('google-refresh-token');
    expect(value).not.toContain(CREATOR.userId);
  });
});
