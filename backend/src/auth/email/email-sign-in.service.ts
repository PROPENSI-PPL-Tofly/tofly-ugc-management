import type { Response } from 'express';
import { sameToken } from '../google/callback.js';
import type { WarningLog } from '../google/google-sign-in.service.js';
import type { SessionStarter, WhitelistResolver } from '../google/ports.js';
import { landingPath } from '../google/redirects.js';
import {
  attemptsLeft,
  isLiveLoginCode,
  MAX_CODE_ATTEMPTS,
} from './login-code-check.js';
import type { LoginCodeHasher } from './login-code-hash.js';
import type { LoginCodeRow, LoginCodeStore } from './login-code-store.js';

export type EmailSignInResult =
  | { outcome: 'signed_in'; redirectTo: string }
  | { outcome: 'wrong'; attemptsLeft: number }
  | { outcome: 'expired' }
  | { outcome: 'denied' }
  | { outcome: 'failed' };

const EXPIRED: EmailSignInResult = { outcome: 'expired' };

/** A database error can quote the email or the hash, so only its class reaches the log. */
function safeReason(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown error';
}

/**
 * The last step of signing in with an email code. Unknown and revoked emails hold a decoy row
 * that no code matches, so this service treats every address alike and whether an email is
 * registered cannot be read from its answers. The whitelist is asked only after a correct code,
 * so "denied" reaches nobody but the owner of a code whose access ended after it was issued.
 */
export class EmailSignInService {
  constructor(
    private readonly codes: LoginCodeStore,
    private readonly whitelist: WhitelistResolver,
    private readonly session: SessionStarter,
    private readonly hash: LoginCodeHasher,
    private readonly logger: WarningLog,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async verify(
    email: string,
    code: string,
    response: Response,
  ): Promise<EmailSignInResult> {
    try {
      const now = this.now();
      const row = await this.codes.latest(email);
      if (row === null || !isLiveLoginCode(row, now)) return EXPIRED;
      if (!sameToken(row.codeHash, this.hash(email, code))) {
        return await this.wrongAttempt(row);
      }
      // Claimed before anything else, so of two simultaneous submissions only one goes on.
      if (!(await this.codes.claim(row.id, now))) return EXPIRED;
      return await this.signIn(email, response);
    } catch (error) {
      this.logger.warn(`Email sign-in failed: ${safeReason(error)}`);
      return { outcome: 'failed' };
    }
  }

  private async wrongAttempt(row: LoginCodeRow): Promise<EmailSignInResult> {
    const attempts = await this.codes.recordWrongAttempt(row.id);
    if (attempts === null || attempts >= MAX_CODE_ATTEMPTS) return EXPIRED;
    return { outcome: 'wrong', attemptsLeft: attemptsLeft(attempts) };
  }

  private async signIn(
    email: string,
    response: Response,
  ): Promise<EmailSignInResult> {
    const principal = await this.whitelist.resolve(email);
    if (!principal) {
      this.logger.warn('Email sign-in refused: no access');
      return { outcome: 'denied' };
    }
    await this.session.start(response, principal);
    return { outcome: 'signed_in', redirectTo: landingPath(principal) };
  }
}
