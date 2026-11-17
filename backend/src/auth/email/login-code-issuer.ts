// What requesting a code needs from the login_codes and login_code_requests tables. Verifying a
// code (#172, SCRUM-241) reads login_codes through its own port, LoginCodeStore; the two stay
// apart so neither subtask has to change the other's interface.

export interface IssueRequest {
  /** Trimmed and lower-cased. */
  email: string;
  /** An HMAC of the code, or a decoy hash for an address that gets no email. */
  codeHash: string;
  createdAt: Date;
  expiresAt: Date;
  /** Requests made after this moment count towards the limit. */
  windowStart: Date;
  /** How many requests the window may hold before another is refused. */
  limit: number;
}

export type IssueResult =
  | { issued: true; id: string }
  /** Refused, nothing stored: the oldest of the `limit` newest requests decides when to retry. */
  | { issued: false; oldestCreatedAt: Date };

export interface LoginCodeIssuer {
  /**
   * Counts the email's requests in the window, then stores the new code and records the request,
   * as one atomic step per email, so simultaneous requests cannot both see room for the last slot.
   */
  issue(request: IssueRequest): Promise<IssueResult>;
  /**
   * Removes the one code row `issue` answered with, after its email could not be sent. The request
   * stays counted: the provider may have delivered the email even though the send failed.
   */
  discard(id: string): Promise<void>;
}

export const LOGIN_CODE_ISSUER = 'LOGIN_CODE_ISSUER';
