import type { Logger } from '@nestjs/common';
import type { EmailMessage, EmailSender } from './email-sender.js';

/**
 * The only part of a failure the log keeps: its class, or its type when it is not an Error.
 * A provider's message can quote the recipient, the code or the account (OWASP-A04, A09).
 */
function errorKind(error: unknown): string {
  return error instanceof Error ? error.constructor.name : typeof error;
}

/**
 * Decorator (GoF, structural) over the outgoing-email port (SCRUM-325). It is an EmailSender
 * itself and wraps another one, so it stands wherever a sender is injected; it adds the one
 * delivery log line without the wrapped sender knowing. The send is passed through untouched
 * and its outcome kept: an accepted send resolves, a refused one rethrows the very same error
 * (OWASP-A10). Never logged: the recipient, the subject or bodies (they carry the code), the
 * SMTP account, or the provider's error text.
 */
export class LoggingEmailSenderDecorator implements EmailSender {
  constructor(
    private readonly inner: EmailSender,
    private readonly log: Pick<Logger, 'log' | 'warn'>,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    try {
      await this.inner.send(message);
    } catch (error) {
      this.log.warn(`Email delivery failed (${errorKind(error)})`);
      throw error;
    }
    this.log.log('Email accepted for delivery');
  }
}
