/** One issued code, or a decoy row for an address that gets no email. */
export interface LoginCodeRow {
  id: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  usedAt: Date | null;
}

/** What verifying a code needs from the login_codes table. */
export interface LoginCodeStore {
  /** The newest row for the email: an older code stops counting once a new one is issued. */
  latest(email: string): Promise<LoginCodeRow | null>;
  /**
   * Adds one wrong attempt in a single atomic step, so parallel guesses cannot share a count.
   * Answers the new count, or null when the code had already reached the limit.
   */
  recordWrongAttempt(id: string): Promise<number | null>;
  /** Marks the code used in a single atomic step; only one caller ever gets true. */
  claim(id: string, at: Date): Promise<boolean>;
}

export const LOGIN_CODE_STORE = 'LOGIN_CODE_STORE';
