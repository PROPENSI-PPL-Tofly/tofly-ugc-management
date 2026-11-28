import { Logger, Module } from '@nestjs/common';
import { AdminEmails } from './admin-emails.js';
import { CreatorEmails } from './creator-emails.js';
import { EMAIL_LOG_STORE, PrismaEmailLogStore, type EmailLogStore } from './email-log-store.js';
import { EMAIL_LOG } from './email-log.token.js';
import { EmailNotifier } from './email-notifier.js';
import { EMAIL_SENDER, type EmailSender } from './email-sender.js';
import { InvoicePdfService } from '../invoices/invoice-pdf.service.js';
import { EMAIL_TEMPLATES, type EmailTemplates } from './email-templates.js';
import { LoggingEmailSenderDecorator } from './logging-email-sender.decorator.js';
import { PrismaContractFacts } from './notifications/contract-facts.js';
import { NotificationEmailTemplates } from './notifications/notification-email-templates.js';
import { emailSenderFromEnv, smtpTransport } from './smtp-email-sender.js';

export { EMAIL_LOG };

/**
 * The outgoing-email wiring (PBI-39, 39.1): EMAIL_SENDER is the real SMTP sender while its
 * account is configured and the fail-closed unready sender while it is not, so a missing
 * secret fails every send rather than the boot (39.2 answers "Kode gagal dikirim. Coba
 * lagi."). Either one is wrapped in LoggingEmailSenderDecorator (SCRUM-325), the single place
 * a delivery is logged. The port is what the modules that send mail import — PBI-11 reuses it
 * unchanged, never knowing a decorator is there.
 *
 * PBI-11 (11.1) adds the event emails on top: the email_log store, the helper that logs, renders
 * and sends, and CreatorEmails, which the services call. EMAIL_TEMPLATES is 11.4's templates:
 * they read the invoice facts and the PBI-31 PDF themselves. InvoicePdfService is provided here,
 * not imported from InvoicesModule, which imports this module (no cycle).
 */
@Module({
  providers: [
    { provide: EMAIL_LOG, useValue: new Logger('EmailSender') },
    {
      provide: EMAIL_SENDER,
      useFactory: (log: Pick<Logger, 'log' | 'warn'>) =>
        new LoggingEmailSenderDecorator(
          emailSenderFromEnv(process.env, smtpTransport),
          log,
        ),
      inject: [EMAIL_LOG],
    },
    PrismaContractFacts,
    InvoicePdfService,
    {
      provide: EMAIL_TEMPLATES,
      useFactory: (facts: PrismaContractFacts, pdfs: InvoicePdfService) =>
        new NotificationEmailTemplates(facts, pdfs),
      inject: [PrismaContractFacts, InvoicePdfService],
    },
    { provide: EMAIL_LOG_STORE, useClass: PrismaEmailLogStore },
    {
      provide: EmailNotifier,
      useFactory: (
        store: EmailLogStore,
        sender: EmailSender,
        templates: EmailTemplates,
        log: Pick<Logger, 'warn'>,
      ) => new EmailNotifier(store, sender, templates, log),
      inject: [EMAIL_LOG_STORE, EMAIL_SENDER, EMAIL_TEMPLATES, EMAIL_LOG],
    },
    { provide: CreatorEmails, useClass: CreatorEmails },
    { provide: AdminEmails, useClass: AdminEmails },
  ],
  exports: [EMAIL_SENDER, EMAIL_LOG_STORE, EmailNotifier, CreatorEmails, AdminEmails],
})
export class EmailModule {}
