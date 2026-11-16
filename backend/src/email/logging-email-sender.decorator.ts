import type { Logger } from '@nestjs/common';
import type { EmailMessage, EmailSender } from './email-sender.js';

/** Decorator (GoF) over the outgoing-email port: wraps another EmailSender and logs its sends. */
export class LoggingEmailSenderDecorator implements EmailSender {
  constructor(
    private readonly inner: EmailSender,
    private readonly log: Pick<Logger, 'log' | 'warn'>,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    try {
      await this.inner.send(message);
    } catch (error) {
      this.log.warn(
        `Email delivery failed (${error instanceof Error ? error.constructor.name : typeof error})`,
      );
      throw error;
    }
    this.log.log('Email accepted for delivery');
  }
}
