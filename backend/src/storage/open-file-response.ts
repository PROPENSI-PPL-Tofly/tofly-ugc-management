import type { Response } from 'express';
import type { OpenedFile } from './file-store.js';

/**
 * Content-Disposition for a file shown in the browser, its name in RFC 5987 form: every
 * character outside the safe set is percent-encoded (encodeURIComponent leaves ' ( ) * as they
 * are), so no name can end the value early or add a header.
 */
export function inlineDisposition(fileName: string): string {
  const encoded = encodeURIComponent(fileName).replaceAll(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `inline; filename*=UTF-8''${encoded}`;
}

/**
 * Answers with an opened file: a redirect to its short-lived link, or its bytes. Neither may be
 * cached, and a signed link must not leak to another site through a Referer.
 */
export function sendOpenedFile(res: Response, opened: OpenedFile): void {
  res.setHeader('Cache-Control', 'private, no-store');

  if (opened.kind === 'redirect') {
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.redirect(302, opened.url);
    return;
  }

  res.setHeader('Content-Type', opened.contentType);
  res.setHeader('Content-Length', String(opened.size));
  res.setHeader('Content-Disposition', inlineDisposition(opened.fileName));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  opened.stream.pipe(res);
}
