import { Logger, Module } from '@nestjs/common';
import { EMAIL_SENDER } from './email-sender.js';
import { emailSenderFromEnv, smtpTransport } from './smtp-email-sender.js';

/** The logger the sender reports failures through, as GoogleSignIn's is bound. */
export const EMAIL_LOG = 'EMAIL_LOG';

/**
 * The outgoing-email wiring (PBI-39, 39.1): EMAIL_SENDER is the real SMTP sender while its
 * account is configured and the fail-closed unready sender while it is not, so a missing
 * secret fails every send rather than the boot (39.2 answers "Kode gagal dikirim. Coba
 * lagi."). The port is what the modules that send mail import — PBI-11 reuses it unchanged.
 */
@Module({
  providers: [
    { provide: EMAIL_LOG, useValue: new Logger('EmailSender') },
    {
      provide: EMAIL_SENDER,
      useFactory: (log: Pick<Logger, 'warn'>) =>
        emailSenderFromEnv(process.env, smtpTransport, log),
      inject: [EMAIL_LOG],
    },
  ],
  exports: [EMAIL_SENDER],
})
export class EmailModule {}
