import type { EmailMessage } from '../../email/email-sender.js';

/** The email that carries a login code; the only place the plain code ever leaves the server. */
export function loginCodeEmail(
  to: string,
  code: string,
  validMinutes: number,
): EmailMessage {
  return {
    to,
    senderName: 'Tofly',
    subject: 'Kode masuk Tofly',
    text: [
      `Kode masuk Tofly kamu: ${code}`,
      '',
      `Kode ini berlaku selama ${validMinutes} menit. Jangan bagikan kode ini kepada siapa pun.`,
      '',
      'Kalau kamu tidak meminta kode ini, abaikan saja email ini.',
    ].join('\n'),
  };
}
