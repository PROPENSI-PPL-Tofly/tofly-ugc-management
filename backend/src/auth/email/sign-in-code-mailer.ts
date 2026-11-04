/**
 * Emails a sign-in code from "Tofly" with the subject "Kode masuk Tofly" (AC 3). Rejects when the
 * email could not be sent (AC 6). SCRUM-239's EmailSender and its template sit behind this port.
 */
export interface SignInCodeMailer {
  sendSignInCode(to: string, code: string): Promise<void>;
}

export const SIGN_IN_CODE_MAILER = 'SIGN_IN_CODE_MAILER';
