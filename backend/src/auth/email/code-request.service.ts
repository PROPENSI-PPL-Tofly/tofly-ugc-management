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
  | { outcome: 'sent' }
  | { outcome: 'limited'; retryAfterMinutes: number }
  | { outcome: 'failed' };

const SENT: CodeRequestResult = { outcome: 'sent' };
const FAILED: CodeRequestResult = { outcome: 'failed' };

function addMinutes(moment: Date, minutes: number): Date {
  return new Date(moment.getTime() + minutes * MINUTE_MS);
}

/** Whole minutes until `moment`, rounded up: 30 seconds left still reads as one minute. */
function minutesUntil(moment: Date, now: Date): number {
  return Math.ceil((moment.getTime() - now.getTime()) / MINUTE_MS);
}

/** A mail or database error can quote the address or the code, so only its class is logged. */
function safeReason(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown error';
}

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
    try {
      const now = this.now();
      const code = this.code();
      // Hashed for every address alike, so a missing secret fails registered and unknown ones the same.
      const codeHash = this.hash(email, code);
      const principal = await this.whitelist.resolve(email);
      const issued = await this.issuer.issue({
        email,
        codeHash: principal ? codeHash : decoyCodeHash(),
        createdAt: now,
        expiresAt: addMinutes(now, CODE_LIFETIME_MINUTES),
        windowStart: addMinutes(now, -REQUEST_WINDOW_MINUTES),
        limit: MAX_REQUESTS_PER_WINDOW,
      });
      if (!issued.issued) {
        const freesAt = addMinutes(
          issued.oldestCreatedAt,
          REQUEST_WINDOW_MINUTES,
        );
        return {
          outcome: 'limited',
          retryAfterMinutes: minutesUntil(freesAt, now),
        };
      }
      if (!principal) return SENT;
      return await this.deliver(email, code, issued.id);
    } catch (error) {
      this.logger.warn(`Code request failed: ${safeReason(error)}`);
      return FAILED;
    }
  }

  /**
   * Sends the code. If it cannot be sent, the row just stored is removed by its own id: the code
   * the user received before is the newest again and still works, and a simultaneous request's
   * code is never touched.
   */
  private async deliver(
    email: string,
    code: string,
    id: string,
  ): Promise<CodeRequestResult> {
    try {
      await this.sender.send(
        loginCodeEmail(email, code, CODE_LIFETIME_MINUTES),
      );
      return SENT;
    } catch (error) {
      this.logger.warn(`Login code email not sent: ${safeReason(error)}`);
      await this.issuer.discard(id);
      return FAILED;
    }
  }
}
