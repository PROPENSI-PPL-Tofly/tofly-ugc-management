/** A code about to be stored: only its hash, never the code itself (AC 12). */
export interface NewLoginCode {
  /** Trimmed and lower-cased, as verify looks it up. */
  email: string;
  codeHash: string;
  expiresAt: Date;
}

export type IssueResult =
  | { issued: true }
  /** At the hourly limit: the oldest code in the window says when the next one is allowed. */
  | { issued: false; oldestInWindow: Date };

/** What requesting a code needs from the login_codes table. */
export interface LoginCodeIssuer {
  /**
   * In one atomic step per email: counts the codes of the last hour and refuses at the limit;
   * otherwise ends every earlier code of the email and stores the new one (AC 4, 5).
   */
  issue(code: NewLoginCode, now: Date): Promise<IssueResult>;
}

export const LOGIN_CODE_ISSUER = 'LOGIN_CODE_ISSUER';
