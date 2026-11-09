import type { Logger } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import { smtpConfig, type SmtpConfig } from './email-config.js';
import { unreadyEmailSender, type EmailMessage, type EmailSender } from './email-sender.js';

/** The one call the adapter makes of a transport, so a test can fake delivery. */
export interface MailTransport {
  sendMail(message: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<unknown>;
}

/** The error's kind, the only part of a failure the log keeps (OWASP-A09). */
function errorKind(error: unknown): string {
  return error instanceof Error ? error.constructor.name : typeof error;
}

/**
 * The outgoing-email port bound to one SMTP account (PBI-39, 39.1): the message is handed to
 * nodemailer as the recipient's mail reader should see it — the message's own sender name over
 * the configured address. A refused send fails the caller's promise (AC 6), logged with the
 * recipient and the error's kind only: never the body (it carries the code), the password, or
 * the error's text.
 */
export class SmtpEmailSender implements EmailSender {
  constructor(
    private readonly config: SmtpConfig,
    private readonly transport: MailTransport,
    private readonly log: Pick<Logger, 'warn'>,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    try {
      await this.transport.sendMail({
        from: `${message.senderName} <${this.config.from}>`,
        to: message.to,
        subject: message.subject,
        text: message.text,
        ...(message.html === undefined ? {} : { html: message.html }),
      });
    } catch (error) {
      this.log.warn(`Email to ${message.to} failed (${errorKind(error)})`);
      throw error;
    }
  }
}

/** The transport the configured account sends through; 465 is the one secure-by-port case. */
export function smtpTransport(config: SmtpConfig): MailTransport {
  return createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
  });
}

/**
 * The sender this process uses: the configured SMTP account, or the fail-closed unready
 * sender while one is missing — no caller may believe a message went out (39.2's contract).
 */
export function emailSenderFromEnv(
  env: Record<string, string | undefined>,
  makeTransport: (config: SmtpConfig) => MailTransport,
  log: Pick<Logger, 'warn'>,
): EmailSender {
  const config = smtpConfig(env);
  return config
    ? new SmtpEmailSender(config, makeTransport(config), log)
    : unreadyEmailSender;
}
