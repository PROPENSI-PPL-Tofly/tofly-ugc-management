import type { Response } from 'express';
import { GoogleSignInService } from '../google/google-sign-in.service.js';
import type { Principal } from '../google/ports.js';
import { sessionCookie } from '../session/session-cookie.js';
import { AppSessionService } from '../session/session.service.js';
import { EmailSignInService } from './email-sign-in.service.js';
import { hashLoginCode, loginCodeHasher } from './login-code-hash.js';
import type { LoginCodeRow, LoginCodeStore } from './login-code-store.js';

const SECRET = 'a-server-secret-of-at-least-32-characters';
const NOW = new Date('2026-11-04T08:00:00.000Z');
const EMAIL = 'rangga@example.com';
const CODE = '123456';
const CREATOR: Principal = {
  userId: 'user-1',
  role: 'creator',
  creatorId: 'creator-1',
};
const ADMIN: Principal = { userId: 'user-2', role: 'admin' };

/** login_codes in memory, with the same atomic rules the table's conditional updates give. */
class FakeStore implements LoginCodeStore {
  rows: LoginCodeRow[] = [];

  issue(email: string, code: string, fields: Partial<LoginCodeRow> = {}) {
    const row: LoginCodeRow = {
      id: `code-${this.rows.length + 1}`,
      codeHash: hashLoginCode(email, code, SECRET),
      expiresAt: new Date(NOW.getTime() + 10 * 60 * 1000),
      attempts: 0,
      usedAt: null,
      ...fields,
    };
    this.rows.push(row);
    return row;
  }

  /** The row kept for an address that gets no email: a hash no code can match. */
  decoy() {
    return this.issue(EMAIL, CODE, { codeHash: 'unguessable-decoy' });
  }

  latest() {
    return Promise.resolve(this.rows.at(-1) ?? null);
  }

  recordWrongAttempt(id: string) {
    const row = this.rows.find((candidate) => candidate.id === id)!;
    if (row.attempts >= 5) return Promise.resolve(null);
    row.attempts += 1;
    return Promise.resolve(row.attempts);
  }

  claim(id: string, at: Date) {
    const row = this.rows.find((candidate) => candidate.id === id)!;
    if (row.usedAt !== null) return Promise.resolve(false);
    row.usedAt = at;
    return Promise.resolve(true);
  }
}

function setup(principal: Principal | null = CREATOR) {
  const store = new FakeStore();
  const whitelist = { resolve: vi.fn().mockResolvedValue(principal) };
  const session = { start: vi.fn().mockResolvedValue(undefined) };
  const logger = { warn: vi.fn() };
  const service = new EmailSignInService(
    store,
    whitelist,
    session,
    loginCodeHasher(SECRET),
    logger,
    () => NOW,
  );
  const response = {} as Response;
  return { store, whitelist, session, logger, service, response };
}

describe('EmailSignInService', () => {
  describe('a correct code', () => {
    it('starts a session for the whitelisted principal and opens the creator home', async () => {
      const { store, whitelist, session, service, response } = setup();
      const row = store.issue(EMAIL, CODE);

      await expect(service.verify(EMAIL, CODE, response)).resolves.toEqual({
        outcome: 'signed_in',
        redirectTo: '/creator/dashboard',
      });
      expect(whitelist.resolve).toHaveBeenCalledWith(EMAIL);
      expect(session.start).toHaveBeenCalledWith(response, CREATOR);
      expect(row.usedAt).toEqual(NOW);
    });

    it('opens the admin home for an admin', async () => {
      const { store, service, response } = setup(ADMIN);
      store.issue(EMAIL, CODE);

      await expect(service.verify(EMAIL, CODE, response)).resolves.toEqual({
        outcome: 'signed_in',
        redirectTo: '/admin/creators',
      });
    });

    it('still works on the last attempt', async () => {
      const { store, service, response } = setup();
      store.issue(EMAIL, CODE, { attempts: 4 });

      await expect(
        service.verify(EMAIL, CODE, response),
      ).resolves.toMatchObject({ outcome: 'signed_in' });
    });
  });

  describe('a wrong code', () => {
    it('counts down the remaining attempts', async () => {
      const { store, session, service, response } = setup();
      store.issue(EMAIL, CODE);

      for (const left of [4, 3, 2, 1]) {
        await expect(
          service.verify(EMAIL, '000000', response),
        ).resolves.toEqual({ outcome: 'wrong', attemptsLeft: left });
      }
      expect(session.start).not.toHaveBeenCalled();
    });

    it('invalidates the code on the fifth attempt, even for the right code afterwards', async () => {
      const { store, session, service, response } = setup();
      store.issue(EMAIL, CODE, { attempts: 4 });

      await expect(service.verify(EMAIL, '000000', response)).resolves.toEqual({
        outcome: 'expired',
      });
      await expect(service.verify(EMAIL, CODE, response)).resolves.toEqual({
        outcome: 'expired',
      });
      expect(session.start).not.toHaveBeenCalled();
    });

    it('reads as expired when a parallel guess took the last attempt first', async () => {
      const { store, service, response } = setup();
      const row = store.issue(EMAIL, CODE, { attempts: 4 });
      vi.spyOn(store, 'latest').mockResolvedValue({ ...row });
      row.attempts = 5;

      await expect(service.verify(EMAIL, '000000', response)).resolves.toEqual({
        outcome: 'expired',
      });
    });

    it('treats the code a newer one replaced as wrong', async () => {
      const { store, session, service, response } = setup();
      store.issue(EMAIL, '111111');
      store.issue(EMAIL, CODE);

      await expect(service.verify(EMAIL, '111111', response)).resolves.toEqual({
        outcome: 'wrong',
        attemptsLeft: 4,
      });
      expect(session.start).not.toHaveBeenCalled();
    });
  });

  describe('a code that cannot be used', () => {
    it('reads as expired when no code was ever requested', async () => {
      const { whitelist, service, response } = setup();

      await expect(service.verify(EMAIL, CODE, response)).resolves.toEqual({
        outcome: 'expired',
      });
      expect(whitelist.resolve).not.toHaveBeenCalled();
    });

    it('reads as expired past its ten minutes, and spends no attempt', async () => {
      const { store, service, response } = setup();
      const row = store.issue(EMAIL, CODE, { expiresAt: NOW });

      await expect(service.verify(EMAIL, CODE, response)).resolves.toEqual({
        outcome: 'expired',
      });
      expect(row.attempts).toBe(0);
    });

    it('refuses a second use of the same code', async () => {
      const { store, session, service, response } = setup();
      store.issue(EMAIL, CODE);

      await service.verify(EMAIL, CODE, response);
      await expect(service.verify(EMAIL, CODE, response)).resolves.toEqual({
        outcome: 'expired',
      });
      expect(session.start).toHaveBeenCalledTimes(1);
    });

    it('lets only one of two simultaneous correct submissions sign in', async () => {
      const { store, session, service, response } = setup();
      store.issue(EMAIL, CODE);

      const results = await Promise.all([
        service.verify(EMAIL, CODE, response),
        service.verify(EMAIL, CODE, response),
      ]);

      expect(results.map(({ outcome }) => outcome).sort()).toEqual([
        'expired',
        'signed_in',
      ]);
      expect(session.start).toHaveBeenCalledTimes(1);
    });
  });

  describe('enumeration', () => {
    it('answers an unregistered email exactly as a registered one, attempt for attempt', async () => {
      const known = setup();
      known.store.issue(EMAIL, CODE);
      const unknown = setup(null);
      unknown.store.decoy();

      for (let attempt = 0; attempt < 6; attempt += 1) {
        const [real, decoy] = await Promise.all([
          known.service.verify(EMAIL, '000000', known.response),
          unknown.service.verify(EMAIL, '000000', unknown.response),
        ]);
        expect(decoy).toEqual(real);
      }
    });

    it('never matches a decoy, and never asks the whitelist about it', async () => {
      const { store, whitelist, service, response } = setup(null);
      store.decoy();

      await expect(service.verify(EMAIL, CODE, response)).resolves.toEqual({
        outcome: 'wrong',
        attemptsLeft: 4,
      });
      expect(whitelist.resolve).not.toHaveBeenCalled();
    });
  });

  describe('access', () => {
    it('denies a correct code whose owner lost access after it was issued', async () => {
      const { store, session, service, response } = setup(null);
      const row = store.issue(EMAIL, CODE);

      await expect(service.verify(EMAIL, CODE, response)).resolves.toEqual({
        outcome: 'denied',
      });
      expect(session.start).not.toHaveBeenCalled();
      expect(row.usedAt).toEqual(NOW);
    });
  });

  describe('failures', () => {
    it('answers failed rather than throw when the store breaks', async () => {
      const { store, service, response } = setup();
      vi.spyOn(store, 'latest').mockRejectedValue(new Error('db down'));

      await expect(service.verify(EMAIL, CODE, response)).resolves.toEqual({
        outcome: 'failed',
      });
    });

    it('answers failed when the session cannot start', async () => {
      const { store, session, service, response } = setup();
      store.issue(EMAIL, CODE);
      session.start.mockRejectedValue(new Error('db down'));

      await expect(service.verify(EMAIL, CODE, response)).resolves.toEqual({
        outcome: 'failed',
      });
    });

    it('logs only the error class, never the message, email or code', async () => {
      const { store, logger, service, response } = setup();
      vi.spyOn(store, 'latest').mockRejectedValue(
        new TypeError(`no row for ${EMAIL} with ${CODE}`),
      );

      await service.verify(EMAIL, CODE, response);

      expect(logger.warn.mock.calls).toEqual([
        ['Email sign-in failed: TypeError'],
      ]);
    });

    it('logs a thrown value that is not an error as unknown', async () => {
      const { store, logger, service, response } = setup();
      vi.spyOn(store, 'latest').mockRejectedValue(`${EMAIL} ${CODE}`);

      await service.verify(EMAIL, CODE, response);

      expect(logger.warn.mock.calls).toEqual([
        ['Email sign-in failed: unknown error'],
      ]);
    });

    it('logs a refusal without naming who was refused', async () => {
      const { store, logger, service, response } = setup(null);
      store.issue(EMAIL, CODE);

      await service.verify(EMAIL, CODE, response);

      expect(logger.warn.mock.calls).toEqual([
        ['Email sign-in refused: no access'],
      ]);
    });
  });

  it('uses the real clock when none is given', async () => {
    const store = new FakeStore();
    store.issue(EMAIL, CODE, { expiresAt: new Date(Date.now() + 60_000) });
    const service = new EmailSignInService(
      store,
      { resolve: vi.fn().mockResolvedValue(CREATOR) },
      { start: vi.fn().mockResolvedValue(undefined) },
      loginCodeHasher(SECRET),
      { warn: vi.fn() },
    );

    await expect(
      service.verify(EMAIL, CODE, {} as Response),
    ).resolves.toMatchObject({ outcome: 'signed_in' });
  });

  describe('session parity with Google', () => {
    const CONFIG = {
      idleTimeoutMs: 30 * 60 * 1000,
      absoluteLifetimeMs: 12 * 60 * 60 * 1000,
      now: () => NOW,
    };

    /** A real session service over a recording table and a recording browser. */
    function realSession() {
      const create = vi.fn().mockResolvedValue(undefined);
      const sessions = new AppSessionService(
        {
          create,
          findUnique: vi.fn(),
          update: vi.fn(),
          deleteMany: vi.fn(),
        },
        CONFIG,
        sessionCookie({ NODE_ENV: 'production' }),
      );
      const cookie = vi.fn();
      return {
        starter: {
          start: async (response: Response, principal: Principal) => {
            await sessions.start(response, principal);
          },
        },
        response: { cookie } as unknown as Response,
        stored: () => {
          const { data } = create.mock.calls[0][0] as {
            data: { idHash: string };
          };
          const { idHash, ...row } = data;
          expect(idHash).toMatch(/^[0-9a-f]{64}$/);
          return row;
        },
        cookie: () => {
          const [name, , options] = cookie.mock.calls[0] as unknown[];
          return { name, options };
        },
      };
    }

    it.each([
      ['creator', CREATOR],
      ['admin', ADMIN],
    ])(
      'gives a %s the same session row, cookie and landing page',
      async (_role, principal) => {
        const whitelist = { resolve: vi.fn().mockResolvedValue(principal) };
        const log = { warn: vi.fn() };

        const google = realSession();
        const landing = await new GoogleSignInService(
          { exchange: vi.fn().mockResolvedValue('id-token') },
          { verify: vi.fn().mockResolvedValue({ sub: 's', email: EMAIL }) },
          whitelist,
          google.starter,
          log,
        ).complete(
          'code',
          { state: 's', verifier: 'v', nonce: 'n' },
          google.response,
        );

        const email = realSession();
        const store = new FakeStore();
        store.issue(EMAIL, CODE);
        const result = await new EmailSignInService(
          store,
          whitelist,
          email.starter,
          loginCodeHasher(SECRET),
          log,
          () => NOW,
        ).verify(EMAIL, CODE, email.response);

        expect(result).toEqual({ outcome: 'signed_in', redirectTo: landing });
        expect(email.stored()).toEqual(google.stored());
        expect(email.cookie()).toEqual(google.cookie());
      },
    );
  });
});
