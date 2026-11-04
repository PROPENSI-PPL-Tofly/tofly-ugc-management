import type { WarningLog } from '../google/google-sign-in.service.js';
import type { WhitelistResolver } from '../google/ports.js';
import type { LoginCodeHasher } from './login-code-hash.js';
import type { LoginCodeIssuer } from './login-code-issuer.js';
import {
  CODE_LIFETIME_MS,
  decoyCodeHash,
  minutesToWait,
  newLoginCode,
} from './login-code-request.js';
import type { SignInCodeMailer } from './sign-in-code-mailer.js';

export type CodeRequestResult =
  | { outcome: 'sent' }
  | { outcome: 'limited'; minutesToWait: number }
  | { outcome: 'failed' };

const SENT: CodeRequestResult = { outcome: 'sent' };
const FAILED: CodeRequestResult = { outcome: 'failed' };

/** An SMTP or database error can quote the email or the code, so only its class is logged. */
function safeReason(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown error';
}

/**
 * The first step of signing in with an email code. Every address takes the same path: a code is
 * drawn and hashed, a row is stored and the hourly limit counts it. Only a whitelisted email's row
 * holds that hash and only that email is sent the code; any other gets a decoy row no code
 * matches. So the answer, the limit and verify's later answers never tell who is registered.
 */
export class EmailCodeRequestService {
  constructor(
    private readonly issuer: LoginCodeIssuer,
    private readonly whitelist: WhitelistResolver,
    private readonly mailer: SignInCodeMailer,
    private readonly hash: LoginCodeHasher,
    private readonly logger: WarningLog,
    private readonly now: () => Date = () => new Date(),
    private readonly drawCode: () => string = newLoginCode,
    private readonly drawDecoy: () => string = decoyCodeHash,
  ) {}

  async request(email: string): Promise<CodeRequestResult> {
    const step = await this.issue(email).catch((error: unknown) => {
      this.logger.warn(`Sign-in code request failed: ${safeReason(error)}`);
      return FAILED;
    });
    if ('outcome' in step) return step;
    return step.mail ? this.send(email, step.code) : SENT;
  }

  /** Stores the row; answers the code to mail, or the outcome when there is nothing to send. */
  private async issue(
    email: string,
  ): Promise<CodeRequestResult | { code: string; mail: boolean }> {
    const now = this.now();
    const principal = await this.whitelist.resolve(email);
    const code = this.drawCode();
    // Hashed for every address, so a missing secret fails them all alike.
    const realHash = this.hash(email, code);
    const result = await this.issuer.issue(
      {
        email,
        codeHash: principal ? realHash : this.drawDecoy(),
        expiresAt: new Date(now.getTime() + CODE_LIFETIME_MS),
      },
      now,
    );
    if (!result.issued) {
      return {
        outcome: 'limited',
        minutesToWait: minutesToWait(result.oldestInWindow, now),
      };
    }
    return { code, mail: principal !== null };
  }

  private async send(email: string, code: string): Promise<CodeRequestResult> {
    try {
      await this.mailer.sendSignInCode(email, code);
      return SENT;
    } catch (error) {
      this.logger.warn(`Sign-in code email not sent: ${safeReason(error)}`);
      return FAILED;
    }
  }
}
