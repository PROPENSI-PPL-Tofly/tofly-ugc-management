import type { Principal } from '../google/ports.js';
import { EmailCodeRequestService } from './email-code-request.service.js';
import type {
  IssueResult,
  LoginCodeIssuer,
  NewLoginCode,
} from './login-code-issuer.js';
import { hashLoginCode, loginCodeHasher } from './login-code-hash.js';
import type { SignInCodeMailer } from './sign-in-code-mailer.js';

const SECRET = 'a-server-secret-of-at-least-32-characters';
const NOW = new Date('2026-11-04T08:00:00.000Z');
const EMAIL = 'rangga@example.com';
const CODE = '482913';
const DECOY = 'd'.repeat(64);
const CREATOR: Principal = {
  userId: 'user-1',
  role: 'creator',
  creatorId: 'creator-1',
};
const ADMIN: Principal = { userId: 'user-2', role: 'admin' };

/** Stands in for login_codes: records what was stored and answers as configured. */
class FakeIssuer implements LoginCodeIssuer {
  stored: NewLoginCode[] = [];
  answer: IssueResult = { issued: true };
  failure: Error | null = null;

  issue(code: NewLoginCode, now: Date): Promise<IssueResult> {
    expect(now).toEqual(NOW);
    if (this.failure) return Promise.reject(this.failure);
    if (this.answer.issued) this.stored.push(code);
    return Promise.resolve(this.answer);
  }
}

function setup(principal: Principal | null = CREATOR, secret = SECRET) {
  const issuer = new FakeIssuer();
  const whitelist = { resolve: vi.fn().mockResolvedValue(principal) };
  const mailer = {
    sendSignInCode: vi.fn<SignInCodeMailer['sendSignInCode']>(),
  };
  mailer.sendSignInCode.mockResolvedValue(undefined);
  const logger = { warn: vi.fn() };
  const service = new EmailCodeRequestService(
    issuer,
    whitelist,
    mailer,
    loginCodeHasher(secret.length > 0 ? secret : undefined),
    logger,
    () => NOW,
    () => CODE,
    () => DECOY,
  );
  return { issuer, whitelist, mailer, logger, service };
}

/** Everything the service wrote to the log, to check nothing personal is in it. */
function logged(logger: { warn: ReturnType<typeof vi.fn> }): string {
  return logger.warn.mock.calls.flat().join('\n');
}

describe('EmailCodeRequestService', () => {
  describe('a whitelisted email', () => {
    it.each([
      ['creator', CREATOR],
      ['admin', ADMIN],
    ])(
      'stores the hashed code for 10 minutes and emails it to a %s',
      async (_role, principal) => {
        const { issuer, whitelist, mailer, service } = setup(principal);

        await expect(service.request(EMAIL)).resolves.toEqual({
          outcome: 'sent',
        });
        expect(whitelist.resolve).toHaveBeenCalledWith(EMAIL);
        expect(issuer.stored).toEqual([
          {
            email: EMAIL,
            codeHash: hashLoginCode(EMAIL, CODE, SECRET),
            expiresAt: new Date('2026-11-04T08:10:00.000Z'),
          },
        ]);
        expect(mailer.sendSignInCode).toHaveBeenCalledExactlyOnceWith(
          EMAIL,
          CODE,
        );
      },
    );

    it('never stores the code itself', async () => {
      const { issuer, service } = setup();

      await service.request(EMAIL);

      expect(JSON.stringify(issuer.stored)).not.toContain(CODE);
    });
  });

  describe('an email with no access', () => {
    it('answers exactly like a whitelisted one, stores a decoy and sends nothing', async () => {
      const registered = setup(CREATOR);
      const unknown = setup(null);

      const expected = await registered.service.request(EMAIL);
      await expect(unknown.service.request(EMAIL)).resolves.toEqual(expected);
      expect(unknown.issuer.stored).toEqual([
        {
          email: EMAIL,
          codeHash: DECOY,
          expiresAt: new Date('2026-11-04T08:10:00.000Z'),
        },
      ]);
      expect(unknown.mailer.sendSignInCode).not.toHaveBeenCalled();
    });

    it('gives a revoked creator no code: the whitelist answers null for them', async () => {
      const { mailer, issuer, service } = setup(null);

      await expect(service.request(EMAIL)).resolves.toEqual({
        outcome: 'sent',
      });
      expect(mailer.sendSignInCode).not.toHaveBeenCalled();
      expect(issuer.stored[0]?.codeHash).toBe(DECOY);
    });
  });

  describe('the hourly limit', () => {
    it.each([
      ['whitelisted', CREATOR],
      ['unknown', null],
    ])(
      'refuses an %s email with the minutes left and sends nothing',
      async (_label, principal) => {
        const { issuer, mailer, service } = setup(principal);
        issuer.answer = {
          issued: false,
          oldestInWindow: new Date('2026-11-04T07:15:00.000Z'),
        };

        await expect(service.request(EMAIL)).resolves.toEqual({
          outcome: 'limited',
          minutesToWait: 15,
        });
        expect(mailer.sendSignInCode).not.toHaveBeenCalled();
      },
    );
  });

  describe('failures', () => {
    it('reports an email that could not be sent and logs only the error class', async () => {
      const { mailer, logger, service } = setup();
      mailer.sendSignInCode.mockRejectedValue(
        new TypeError(`SMTP refused ${EMAIL} with ${CODE}`),
      );

      await expect(service.request(EMAIL)).resolves.toEqual({
        outcome: 'failed',
      });
      expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
        'Sign-in code email not sent: TypeError',
      );
    });

    it.each([
      [
        'the whitelist',
        (s: ReturnType<typeof setup>) =>
          s.whitelist.resolve.mockRejectedValue(new RangeError(EMAIL)),
        'RangeError',
      ],
      [
        'login_codes',
        (s: ReturnType<typeof setup>) => {
          s.issuer.failure = new SyntaxError(EMAIL);
        },
        'SyntaxError',
      ],
      [
        'something that is not an Error',
        (s: ReturnType<typeof setup>) =>
          s.whitelist.resolve.mockRejectedValue(EMAIL),
        'unknown error',
      ],
    ])(
      'fails closed when %s fails, logging no email',
      async (_label, breakIt, reason) => {
        const s = setup();
        breakIt(s);

        await expect(s.service.request(EMAIL)).resolves.toEqual({
          outcome: 'failed',
        });
        expect(s.mailer.sendSignInCode).not.toHaveBeenCalled();
        expect(s.logger.warn).toHaveBeenCalledExactlyOnceWith(
          `Sign-in code request failed: ${reason}`,
        );
      },
    );

    it('fails for every address alike while LOGIN_CODE_SECRET is missing', async () => {
      const registered = setup(CREATOR, '');
      const unknown = setup(null, '');

      await expect(registered.service.request(EMAIL)).resolves.toEqual({
        outcome: 'failed',
      });
      await expect(unknown.service.request(EMAIL)).resolves.toEqual({
        outcome: 'failed',
      });
      expect(registered.issuer.stored).toEqual([]);
      expect(unknown.issuer.stored).toEqual([]);
    });

    it('never writes the email or the code to the log', async () => {
      const { mailer, logger, service } = setup();
      mailer.sendSignInCode.mockRejectedValue(new Error(`${EMAIL} ${CODE}`));

      await service.request(EMAIL);

      expect(logged(logger)).not.toContain(EMAIL);
      expect(logged(logger)).not.toContain(CODE);
    });
  });

  it('uses the clock, a CSPRNG code and a random decoy by default', async () => {
    const stored: NewLoginCode[] = [];
    const service = new EmailCodeRequestService(
      {
        issue: (code) => {
          stored.push(code);
          return Promise.resolve({ issued: true });
        },
      },
      { resolve: () => Promise.resolve(null) },
      { sendSignInCode: vi.fn() },
      loginCodeHasher(SECRET),
      { warn: vi.fn() },
    );
    const before = Date.now();

    await service.request(EMAIL);

    expect(stored[0]?.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored[0]?.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + 10 * 60 * 1000,
    );
  });
});
