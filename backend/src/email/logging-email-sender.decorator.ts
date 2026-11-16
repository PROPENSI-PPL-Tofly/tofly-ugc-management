import type { Logger } from '@nestjs/common';
import type { EmailMessage, EmailSender } from './email-sender.js';

/** Decorator (GoF) over the outgoing-email port: wraps another EmailSender and logs its sends. */
export class LoggingEmailSenderDecorator implements EmailSender {
  constructor(
    private readonly inner: EmailSender,
    private readonly log: Pick<Logger, 'log'>,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    await this.inner.send(message);
    this.log.log('Email accepted for delivery');
  }
}
