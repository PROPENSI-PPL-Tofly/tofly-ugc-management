// What requesting a code needs from the login_codes table. Verifying a code (#172, SCRUM-241)
// reads the same table through its own port, LoginCodeStore; the two stay apart so neither
// subtask has to change the other's interface.

export interface IssueRequest {
  /** Trimmed and lower-cased. */
  email: string;
  /** An HMAC of the code, or a decoy hash for an address that gets no email. */
  codeHash: string;
  createdAt: Date;
  expiresAt: Date;
  /** Rows created after this moment count towards the limit. */
  windowStart: Date;
  /** How many rows the window may hold before a request is refused. */
  limit: number;
}

export type IssueResult =
  | { issued: true; id: string }
  /** Refused, nothing stored: the oldest of the `limit` newest rows decides when to retry. */
  | { issued: false; oldestCreatedAt: Date };

export interface LoginCodeIssuer {
  /**
   * Counts the email's rows in the window and stores the new one as one atomic step per email,
   * so simultaneous requests cannot both see room for the last slot.
   */
  issue(request: IssueRequest): Promise<IssueResult>;
  /** Removes the one row `issue` answered with, after its email could not be sent. */
  discard(id: string): Promise<void>;
}

export const LOGIN_CODE_ISSUER = 'LOGIN_CODE_ISSUER';
