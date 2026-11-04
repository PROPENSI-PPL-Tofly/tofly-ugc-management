import { PortNotReady } from '../google/unready-ports.js';

/**
 * Emails a sign-in code from "Tofly" with the subject "Kode masuk Tofly" (AC 3). Rejects when the
 * email could not be sent (AC 6). SCRUM-239's EmailSender and its template sit behind this port.
 */
export interface SignInCodeMailer {
  sendSignInCode(to: string, code: string): Promise<void>;
}

export const SIGN_IN_CODE_MAILER = 'SIGN_IN_CODE_MAILER';

/**
 * PLACEHOLDER until SCRUM-239 (39.1) lands its EmailSender port, adapter and template: bound in
 * EmailCodeRequestModule so a whitelisted email is told the code could not be sent (AC 6) rather
 * than told it was sent. 39.1 replaces this binding with an adapter over its EmailSender.
 */
export const unreadySignInCodeMailer: SignInCodeMailer = {
  sendSignInCode: () =>
    Promise.reject(
      new PortNotReady('EmailSender (SCRUM-239) is not available yet'),
    ),
};
