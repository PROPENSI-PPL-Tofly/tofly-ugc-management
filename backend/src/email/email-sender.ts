import { PortNotReady } from '../auth/google/unready-ports.js';

// The outgoing-email port. Callers compose the message; an adapter (SMTP, this subtask)
// delivers it. Agreed with 39.2's shape: the message is the smallest a login code needs, with
// `html` added beside the plain text so a template can offer both (39.1). PBI-11 reuses the
// same port for its own messages.

export interface EmailMessage {
  /** One recipient address. */
  to: string;
  /** The display name the recipient sees, e.g. "Tofly"; the address itself is the adapter's. */
  senderName: string;
  subject: string;
  /** Plain-text body. */
  text: string;
  /** The same message in HTML, for mail readers that show it; left out for a text-only send. */
  html?: string;
}

export interface EmailSender {
  /** Resolves once the message is accepted for delivery; rejects when it is not. */
  send(message: EmailMessage): Promise<void>;
}

export const EMAIL_SENDER = 'EMAIL_SENDER';

/** Bound until an adapter is configured; every send fails, so no caller believes a code went out. */
export const unreadyEmailSender: EmailSender = {
  send: () =>
    Promise.reject(new PortNotReady('Email sending is not configured')),
};
