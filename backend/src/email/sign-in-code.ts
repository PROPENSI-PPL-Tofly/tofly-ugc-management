import type { EmailMessage } from './email-sender.js';

// The sign-in code email (PBI-39, 39.1): what a creator receives when they ask for a code.
// Pure module — nothing is sent here — so the words and both bodies are tested without a
// transport. The caller names the recipient; everything else about the message is this file's.

/** The sender the recipient sees (AC 3). */
export const SIGN_IN_CODE_SENDER = 'Tofly';

/** AC 3's subject, word for word. */
export const SIGN_IN_CODE_SUBJECT = 'Kode masuk Tofly';

/** The minutes the code stays valid (AC 3); the verifier keeps the same limit (39.3). */
export const SIGN_IN_CODE_VALID_MINUTES = 10;

/** Everything the message says beside its recipient: `send({ to, ...signInCodeEmail(code) })`. */
export type SignInCodeEmail = Omit<EmailMessage, 'to'>;

/** The five characters that would otherwise become markup in the HTML body. */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

/** The two bodies' shared words, so the plain text and the HTML cannot drift apart. */
function paragraphs(code: string): string[] {
  return [
    `Kode kamu: ${code}`,
    `Kode berlaku ${SIGN_IN_CODE_VALID_MINUTES} menit dan hanya bisa dipakai sekali. Jangan bagikan kode ini ke siapa pun.`,
    'Jika kamu tidak meminta kode ini, abaikan email ini.',
  ];
}

export function signInCodeEmail(code: string): SignInCodeEmail {
  const [codeLine, validity, closing] = paragraphs(code);

  return {
    senderName: SIGN_IN_CODE_SENDER,
    subject: SIGN_IN_CODE_SUBJECT,
    text: [SIGN_IN_CODE_SUBJECT, '', ...paragraphs(code)].join('\n'),
    html: [
      '<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;line-height:1.5">',
      `<p style="margin:0 0 12px;font-size:16px;font-weight:700">${SIGN_IN_CODE_SUBJECT}</p>`,
      `<p style="margin:0 0 12px;font-size:13px">${escapeHtml(codeLine)}</p>`,
      `<p style="margin:0 0 12px;font-size:13px">${escapeHtml(validity)}</p>`,
      `<p style="margin:0;font-size:13px">${escapeHtml(closing)}</p>`,
      '</div>',
    ].join('\n'),
  };
}
