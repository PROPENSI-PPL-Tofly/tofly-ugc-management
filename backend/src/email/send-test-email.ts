import { Logger } from '@nestjs/common';
import type { SmtpConfig } from './email-config.js';
import { signInCodeEmail } from './sign-in-code.js';
import {
  emailSenderFromEnv,
  smtpTransport,
  type MailTransport,
} from './smtp-email-sender.js';

/**
 * The done-when's real in-box check (AC 3): one sign-in-code email to the address given, sent
 * by the same sender and template the app sends with, so what arrives is what a creator gets.
 * The code is a fixed test code — nothing to check here but the delivery, the "Tofly" sender
 * and the "Kode masuk Tofly" subject. Its command line lives in send-test-email-cli.ts.
 */
export async function sendTestEmail(
  to: string,
  env: Record<string, string | undefined> = process.env,
  makeTransport: (config: SmtpConfig) => MailTransport = smtpTransport,
): Promise<void> {
  const sender = emailSenderFromEnv(env, makeTransport, new Logger('EmailTest'));
  await sender.send({ to, ...signInCodeEmail('123456') });
}
