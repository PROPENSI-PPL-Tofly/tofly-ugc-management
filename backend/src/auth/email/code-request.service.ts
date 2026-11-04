import type { EmailSender } from '../../email/email-sender.js';
import type { WarningLog } from '../google/google-sign-in.service.js';
import type { WhitelistResolver } from '../google/ports.js';
import { loginCodeEmail } from './login-code-email.js';
import { decoyCodeHash, generateLoginCode } from './login-code-generator.js';
import type { LoginCodeHasher } from './login-code-hash.js';
import type { LoginCodeIssuer } from './login-code-issuer.js';

const MINUTE_MS = 60_000;
/** PBI-39: a code is valid for exactly ten minutes. */
export const CODE_LIFETIME_MINUTES = 10;
/** PBI-39: at most five requests per email in any sixty minutes. */
export const MAX_REQUESTS_PER_WINDOW = 5;
export const REQUEST_WINDOW_MINUTES = 60;

export type CodeRequestResult =
  { outcome: 'sent' } | { outcome: 'limited'; retryAfterMinutes: number };

const SENT: CodeRequestResult = { outcome: 'sent' };

/**
 * The first step of signing in with an email code: issue one and email it. An address the
 * whitelist does not know, or no longer lets in, gets no email but a decoy row in its place, so
 * it is rate-limited and later verified like any other and its answers match a registered one.
 */
export class CodeRequestService {
  constructor(
    private readonly issuer: LoginCodeIssuer,
    private readonly whitelist: WhitelistResolver,
    private readonly sender: EmailSender,
    private readonly hash: LoginCodeHasher,
    private readonly logger: WarningLog,
    private readonly now: () => Date = () => new Date(),
    private readonly code: () => string = generateLoginCode,
  ) {}

  /** @param email already trimmed and lower-cased */
  async request(email: string): Promise<CodeRequestResult> {
    const now = this.now();
    const code = this.code();
    // Hashed for every address alike, so a missing secret fails registered and unknown ones the same.
    const codeHash = this.hash(email, code);
    const principal = await this.whitelist.resolve(email);
    const issued = await this.issuer.issue({
      email,
      codeHash: principal ? codeHash : decoyCodeHash(),
      createdAt: now,
      expiresAt: new Date(now.getTime() + CODE_LIFETIME_MINUTES * MINUTE_MS),
      windowStart: new Date(now.getTime() - REQUEST_WINDOW_MINUTES * MINUTE_MS),
      limit: MAX_REQUESTS_PER_WINDOW,
    });
    if (!issued.issued) {
      const freesAt =
        issued.oldestCreatedAt.getTime() + REQUEST_WINDOW_MINUTES * MINUTE_MS;
      return {
        outcome: 'limited',
        retryAfterMinutes: Math.ceil((freesAt - now.getTime()) / MINUTE_MS),
      };
    }
    if (!principal) return SENT;
    await this.sender.send(loginCodeEmail(email, code, CODE_LIFETIME_MINUTES));
    return SENT;
  }
}
