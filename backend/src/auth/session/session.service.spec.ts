import type { Response } from 'express';
import { AppSessionService, type SessionRepository } from './session.service.js';
import type { Principal } from '../google/ports.js';

const CREATOR: Principal = {
  userId: 'user-1',
  role: 'creator',
  creatorId: 'creator-1',
};
const NOW = new Date('2026-09-27T00:00:00.000Z');
const IDLE_MS = 30 * 60 * 1000;
const ABSOLUTE_MS = 12 * 60 * 60 * 1000;

function repository(): SessionRepository & {
  records: Map<string, Record<string, unknown>>;
} {
  const records = new Map<string, Record<string, unknown>>();
  return {
    records,
    create: vi.fn(async ({ data }) => {
      records.set(data.idHash, data);
      return data;
    }),
    findUnique: vi.fn(async ({ where }) => records.get(where.idHash) ?? null),
    update: vi.fn(async ({ where, data }) => {
      const current = records.get(where.idHash);
      if (!current) throw new Error('session not found');
      const updated = { ...current, ...data };
      records.set(where.idHash, updated);
      return updated;
    }),
    deleteMany: vi.fn(async ({ where }) => ({ count: Number(records.delete(where.idHash)) })),
  };
}

function response(): Response & { cookie: ReturnType<typeof vi.fn> } {
  return { cookie: vi.fn() } as unknown as Response & { cookie: ReturnType<typeof vi.fn> };
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

  it('sets an httpOnly, secure, host-only Lax cookie in production', async () => {
    const reply = response();
    await sessions.start(reply, CREATOR);

    expect(reply.cookie).toHaveBeenCalledWith(
      '__Host-tofly_session',
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

    await expect(sessions.authenticate(id, reply)).resolves.toMatchObject(CREATOR);
    expect(store.update).toHaveBeenCalledWith({
      where: { idHash: expect.any(String) },
      data: { idleExpiresAt: new Date(NOW.getTime() + 5 * 60 * 1000 + IDLE_MS) },
    });
    expect(reply.cookie).toHaveBeenCalledWith(
      '__Host-tofly_session',
      id,
      expect.objectContaining({ maxAge: IDLE_MS }),
    });
  });

  it.each([
    ['a missing session', undefined],
    ['a malformed session', 'not-a-session-id'],
    ['an empty session', ''],
  ])('rejects %s', async (_label, id) => {
    await expect(sessions.authenticate(id)).resolves.toBeNull();
    expect(store.findUnique).not.toHaveBeenCalled();
  });

  it('rejects and deletes an expired idle session', async () => {
    const { id } = await sessions.start(response(), CREATOR);
    const record = [...store.records.values()][0];
    record.idleExpiresAt = new Date(NOW.getTime() - 1);

    await expect(sessions.authenticate(id)).resolves.toBeNull();
    expect(store.deleteMany).toHaveBeenCalledWith({ where: { idHash: expect.any(String) } });
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
    currentTime = new Date(NOW.getTime() + 11 * 60 * 60 * 1000 + 45 * 60 * 1000);

    await expect(sessions.authenticate(id, reply)).resolves.toMatchObject(CREATOR);
    expect(store.update).toHaveBeenCalledWith({
      where: { idHash: expect.any(String) },
      data: { idleExpiresAt: new Date(NOW.getTime() + ABSOLUTE_MS) },
    });
    expect(reply.cookie).toHaveBeenCalledWith(
      expect.any(String),
      id,
      expect.objectContaining({ maxAge: 15 * 60 * 1000 }),
    );
  });

  it('revokes a session and makes its previous cookie unusable', async () => {
    const { id } = await sessions.start(response(), CREATOR);

    await sessions.logout(id, response());

    await expect(sessions.authenticate(id)).resolves.toBeNull();
    expect(store.deleteMany).toHaveBeenCalledWith({ where: { idHash: expect.any(String) } });
  });

  it('clears the browser cookie on logout', async () => {
    const { id } = await sessions.start(response(), CREATOR);
    const reply = response() as Response & { clearCookie: ReturnType<typeof vi.fn> };
    reply.clearCookie = vi.fn();

    await sessions.logout(id, reply);

    expect(reply.clearCookie).toHaveBeenCalledWith(
      '__Host-tofly_session',
      expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'lax', path: '/' }),
    );
  });

  it('fails closed when session storage is unavailable', async () => {
    store.findUnique = vi.fn().mockRejectedValue(new Error('database offline'));
    const result = await sessions.authenticate('c'.repeat(43)).then(
      (principal) => ({ kind: 'principal' as const, principal }),
      (error: unknown) => ({ kind: 'error' as const, error }),
    );

    expect(result).toMatchObject({
      kind: 'error',
      error: { message: 'database offline' },
    });
    // The service contract rejects on storage failure; no Principal is returned or trusted.
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
