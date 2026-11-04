import { Logger } from '@nestjs/common';
import type { SmtpConfig } from './email-config.js';
import { signInCodeEmail } from './sign-in-code.js';
import {
  emailSenderFromEnv,
  smtpTransport,
  type MailTransport,
} from './smtp-email-sender.js';

/**
 * The DoD's real in-box check (AC 3): one sign-in-code email to the address given, sent by
 * the same sender and template the app sends with, so what arrives is what a creator gets.
 * The code is a fixed test code — nothing to check here but the delivery, the "Tofly" sender
 * and the "Kode masuk Tofly" subject. Build first, then:
 *   npm run email:test -- someone@example.com
 */
export async function sendTestEmail(
  to: string,
  env: Record<string, string | undefined> = process.env,
  makeTransport: (config: SmtpConfig) => MailTransport = smtpTransport,
): Promise<void> {
  const sender = emailSenderFromEnv(env, makeTransport, new Logger('EmailTest'));
  await sender.send({ to, ...signInCodeEmail('123456') });
}

// Run by `npm run email:test`; the argv check keeps importing this module side-effect free.
if (process.argv[1]?.endsWith('send-test-email.js')) {
  const to = process.argv[2];
  if (!to) {
    console.error('usage: npm run email:test -- <address>');
    process.exit(1);
  }
  sendTestEmail(to)
    .then(() => {
      console.log(`sent to ${to}`);
    })
    .catch((error: unknown) => {
      console.error(`send failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    });
}
