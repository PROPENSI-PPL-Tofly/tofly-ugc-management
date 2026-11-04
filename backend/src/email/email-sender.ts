import { PortNotReady } from '../auth/google/unready-ports.js';

// The outgoing-email port. Callers compose the message; an adapter (SMTP, PBI-39.1) delivers it.
// The shape is the smallest that a login code needs, pending agreement with the 39.1 owner.

export interface EmailMessage {
  /** One recipient address. */
  to: string;
  /** The display name the recipient sees, e.g. "Tofly"; the address itself is the adapter's. */
  senderName: string;
  subject: string;
  /** Plain-text body. */
  text: string;
}

export interface EmailSender {
  /** Resolves once the message is accepted for delivery; rejects when it is not. */
  send(message: EmailMessage): Promise<void>;
}

export const EMAIL_SENDER = 'EMAIL_SENDER';

/** Bound until 39.1 provides a sender; every send fails, so no caller believes a code went out. */
export const unreadyEmailSender: EmailSender = {
  send: () =>
    Promise.reject(new PortNotReady('Email sending is not configured')),
};
