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
    const now = this.now();
    const principal = await this.whitelist.resolve(email);
    const code = this.drawCode();
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
    if (principal) await this.mailer.sendSignInCode(email, code);
    return SENT;
  }
}
