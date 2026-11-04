import type { EmailMessage, EmailSender } from '../../email/email-sender.js';
import type { Principal, WhitelistResolver } from '../google/ports.js';
import { CodeRequestService } from './code-request.service.js';
import { hashLoginCode, loginCodeHasher } from './login-code-hash.js';
import type {
  IssueRequest,
  IssueResult,
  LoginCodeIssuer,
} from './login-code-issuer.js';

const SECRET = 'a-server-secret-of-at-least-32-characters';
const NOW = new Date('2026-11-04T03:00:00.000Z');
const MINUTE = 60_000;
const CREATOR = 'rangga@example.com';
const ADMIN = 'admin@tofly.id';
const CODE = '012345';
/** The whitelist answers null for a revoked creator, exactly as for an unknown address. */
const REVOKED = 'revoked@example.com';
const UNKNOWN = 'nobody@example.com';

interface StoredRow {
  id: string;
  email: string;
  codeHash: string;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * A fake of the login_codes table: the same rules as the Prisma adapter (the newest `limit` rows
 * inside the window decide; a refused request stores nothing), kept in memory.
 */
class FakeIssuer implements LoginCodeIssuer {
  rows: StoredRow[] = [];
  private next = 0;

  issue(request: IssueRequest): Promise<IssueResult> {
    const recent = this.rows
      .filter(
        (row) =>
          row.email === request.email && row.createdAt > request.windowStart,
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, request.limit);
    if (recent.length >= request.limit) {
      return Promise.resolve({
        issued: false,
        oldestCreatedAt: recent[recent.length - 1].createdAt,
      });
    }
    this.next += 1;
    const id = `code-${this.next}`;
    this.rows.push({
      id,
      email: request.email,
      codeHash: request.codeHash,
      createdAt: request.createdAt,
      expiresAt: request.expiresAt,
    });
    return Promise.resolve({ issued: true, id });
  }

  discard(id: string): Promise<void> {
    this.rows = this.rows.filter((row) => row.id !== id);
    return Promise.resolve();
  }

  /** The row #172's verification reads: the newest for the email. */
  latest(email: string): StoredRow | undefined {
    return this.rows
      .filter((row) => row.email === email)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  }
}

const PRINCIPALS: Record<string, Principal> = {
  [CREATOR]: { userId: 'user-1', role: 'creator', creatorId: 'creator-1' },
  [ADMIN]: { userId: 'user-2', role: 'admin' },
};

function setup(options: { now?: () => Date; code?: () => string } = {}) {
  const issuer = new FakeIssuer();
  // A stub: canned whitelist answers, nothing recorded.
  const whitelist: WhitelistResolver = {
    resolve: (email) => Promise.resolve(PRINCIPALS[email] ?? null),
  };
  // A mock: the test asserts on what it was asked to send.
  const send = vi.fn<(message: EmailMessage) => Promise<void>>(() =>
    Promise.resolve(),
  );
  const sender: EmailSender = { send };
  const warn = vi.fn<(message: string) => void>();
  const service = new CodeRequestService(
    issuer,
    whitelist,
    sender,
    loginCodeHasher(SECRET),
    { warn },
    options.now ?? (() => NOW),
    options.code ?? (() => CODE),
  );
  return { service, issuer, send, warn };
}

describe('CodeRequestService', () => {
  describe.each([
    ['an unregistered email', UNKNOWN],
    ['a revoked creator', REVOKED],
  ])('%s', (_, email) => {
    it('sends no email', async () => {
      const { service, send } = setup();
      await service.request(email);
      expect(send).not.toHaveBeenCalled();
    });

    it('still stores a row, so the rate limit and verification treat it like any address', async () => {
      const { service, issuer } = setup();
      await service.request(email);
      expect(issuer.rows).toHaveLength(1);
      expect(issuer.rows[0]).toMatchObject({ email, createdAt: NOW });
      expect(issuer.rows[0].expiresAt.getTime() - NOW.getTime()).toBe(
        10 * MINUTE,
      );
    });

    it('stores a decoy shaped like a real hash that the generated code does not match', async () => {
      const { service, issuer } = setup();
      await service.request(email);
      const { codeHash } = issuer.rows[0];
      expect(codeHash).toMatch(/^[0-9a-f]{64}$/);
      expect(codeHash).not.toBe(hashLoginCode(email, CODE, SECRET));
    });

    it('draws a fresh decoy every time', async () => {
      const { service, issuer } = setup();
      await service.request(email);
      await service.request(email);
      expect(issuer.rows[0].codeHash).not.toBe(issuer.rows[1].codeHash);
    });

    it('answers exactly what a registered email gets', async () => {
      const registered = await setup().service.request(CREATOR);
      const unregistered = await setup().service.request(email);
      expect(unregistered).toEqual(registered);
    });
  });

  describe('the hourly limit', () => {
    /** Requests from one email at the given offsets in milliseconds after NOW. */
    async function requestsAt(email: string, offsets: number[]) {
      let now = NOW;
      const context = setup({ now: () => now });
      const results = [];
      for (const offset of offsets) {
        now = new Date(NOW.getTime() + offset);
        results.push(await context.service.request(email));
      }
      return { ...context, results };
    }

    const FIVE = [0, 1, 2, 3, 4].map((minutes) => minutes * MINUTE);

    it('lets five requests through in one hour', async () => {
      const { results, send } = await requestsAt(CREATOR, FIVE);
      expect(results).toEqual(Array(5).fill({ outcome: 'sent' }));
      expect(send).toHaveBeenCalledTimes(5);
    });

    it('refuses the sixth, storing and sending nothing', async () => {
      const { results, issuer, send } = await requestsAt(CREATOR, [
        ...FIVE,
        10 * MINUTE,
      ]);
      expect(results[5]).toEqual({ outcome: 'limited', retryAfterMinutes: 50 });
      expect(issuer.rows).toHaveLength(5);
      expect(send).toHaveBeenCalledTimes(5);
    });

    it.each([
      ['a minute and a second', 58 * MINUTE + 59_000, 2],
      ['one millisecond', 60 * MINUTE - 1, 1],
      ['59 minutes and 59 seconds', 1_000, 60],
    ])(
      'rounds a wait of %s up to whole minutes',
      async (_, sixthAt, minutes) => {
        const { results } = await requestsAt(CREATOR, [0, 0, 0, 0, 0, sixthAt]);
        expect(results[5]).toEqual({
          outcome: 'limited',
          retryAfterMinutes: minutes,
        });
      },
    );

    it('lets a request through again once the oldest one is sixty minutes old', async () => {
      const { results } = await requestsAt(CREATOR, [...FIVE, 60 * MINUTE]);
      expect(results[5]).toEqual({ outcome: 'sent' });
    });

    it('rolls: after one slot frees up, the next wait runs from the second-oldest request', async () => {
      const { results } = await requestsAt(CREATOR, [
        ...FIVE,
        60 * MINUTE,
        60 * MINUTE + 30_000,
      ]);
      expect(results[6]).toEqual({ outcome: 'limited', retryAfterMinutes: 1 });
    });

    it('counts each email on its own', async () => {
      let now = NOW;
      const { service } = setup({ now: () => now });
      for (const minutes of [0, 1, 2, 3, 4]) {
        now = new Date(NOW.getTime() + minutes * MINUTE);
        await service.request(CREATOR);
      }
      await expect(service.request(ADMIN)).resolves.toEqual({
        outcome: 'sent',
      });
    });

    it.each([
      ['an unregistered email', UNKNOWN],
      ['a revoked creator', REVOKED],
    ])('limits %s exactly as a registered one', async (_, email) => {
      const registered = await requestsAt(CREATOR, [...FIVE, 10 * MINUTE]);
      const other = await requestsAt(email, [...FIVE, 10 * MINUTE]);
      expect(other.results).toEqual(registered.results);
    });
  });

  describe('a whitelisted creator', () => {
    it('stores only the HMAC of the code, never the code itself', async () => {
      const { service, issuer } = setup();
      await service.request(CREATOR);
      expect(issuer.rows).toHaveLength(1);
      expect(issuer.rows[0].codeHash).not.toContain(CODE);
      expect(issuer.rows[0].codeHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('hashes exactly as the verification of #172 will, with the shared helper', async () => {
      const { service, issuer } = setup();
      await service.request(CREATOR);
      expect(issuer.rows[0].codeHash).toBe(
        hashLoginCode(CREATOR, CODE, SECRET),
      );
    });

    it('lets the code live exactly ten minutes', async () => {
      const { service, issuer } = setup();
      await service.request(CREATOR);
      expect(issuer.rows[0].createdAt).toEqual(NOW);
      expect(issuer.rows[0].expiresAt.getTime() - NOW.getTime()).toBe(
        10 * MINUTE,
      );
    });

    it('emails the plain code to the requester', async () => {
      const { service, send } = setup();
      await service.request(CREATOR);
      expect(send).toHaveBeenCalledOnce();
      expect(send.mock.calls[0][0]).toMatchObject({
        to: CREATOR,
        senderName: 'Tofly',
        subject: 'Kode masuk Tofly',
      });
      expect(send.mock.calls[0][0].text).toContain(CODE);
      expect(send.mock.calls[0][0].text).toContain('10 menit');
    });

    it('answers sent', async () => {
      const { service } = setup();
      await expect(service.request(CREATOR)).resolves.toEqual({
        outcome: 'sent',
      });
    });
  });

  describe('an admin', () => {
    it('gets a code too: the whitelist, not the role, decides', async () => {
      const { service, issuer, send } = setup();
      await expect(service.request(ADMIN)).resolves.toEqual({
        outcome: 'sent',
      });
      expect(issuer.rows[0].codeHash).toBe(hashLoginCode(ADMIN, CODE, SECRET));
      expect(send).toHaveBeenCalledOnce();
    });
  });

  describe('a second request', () => {
    it('makes the new code the newest, so the earlier one no longer verifies', async () => {
      let code = '111111';
      let now = NOW;
      const { service, issuer } = setup({
        code: () => code,
        now: () => now,
      });
      await service.request(CREATOR);
      code = '222222';
      now = new Date(NOW.getTime() + MINUTE);
      await service.request(CREATOR);
      expect(issuer.latest(CREATOR)?.codeHash).toBe(
        hashLoginCode(CREATOR, '222222', SECRET),
      );
    });
  });

  it('uses the real clock and a random code when none are given', async () => {
    const issuer = new FakeIssuer();
    const send = vi.fn<(message: EmailMessage) => Promise<void>>(() =>
      Promise.resolve(),
    );
    const service = new CodeRequestService(
      issuer,
      { resolve: () => Promise.resolve(PRINCIPALS[CREATOR]) },
      { send },
      loginCodeHasher(SECRET),
      { warn: vi.fn() },
    );
    const before = Date.now();
    await service.request(CREATOR);
    const [row] = issuer.rows;
    expect(row.createdAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(row.createdAt.getTime()).toBeLessThanOrEqual(Date.now());
    const sentCode = /\d{6}/.exec(send.mock.calls[0][0].text)?.[0];
    expect(row.codeHash).toBe(hashLoginCode(CREATOR, sentCode!, SECRET));
  });
});
