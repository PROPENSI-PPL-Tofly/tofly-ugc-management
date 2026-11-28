import { escapeHtml } from '../html.js';

// The one layout every notification email uses (PBI-11 AC 7): a greeting by name, at most three
// short lines, one button to the exact page and the fixed footer, in HTML and in plain text.
// Templates only say what is different; this file owns how every email looks, so a change to the
// look is one change here (Template Method: the steps are fixed, the words are the template's).

export const MAX_SUBJECT_LENGTH = 60;

export const MAX_LINES = 3;

export const NOTIFICATION_FOOTER =
  'Email otomatis dari Tofly. Jangan balas email ini.';

/** What a template says; the layout draws it. */
export interface NotificationParts {
  /** The recipient's name; null or blank greets without one. */
  greetingName: string | null;
  lines: string[];
  /** The page the button opens, as a path on the app (`/creator/tasks?content=…`). */
  button: { label: string; path: string };
}

export interface RenderedNotification {
  text: string;
  html: string;
}

// Admins have no name yet, so 11.2 greets them by their address (admin-emails.ts); an address is
// not a name, and greeting with it would only repeat the To line.
function greeting(name: string | null): string {
  const trimmed = name?.trim();
  return trimmed && !trimmed.includes('@') ? `Halo ${trimmed},` : 'Halo,';
}

/**
 * The button's address: the app's own origin and a path on it. A path that is a full address or
 * starts with `//` would send the recipient to another site, so it is refused before any email is
 * drawn (OWASP A01: no open redirect through an email).
 */
function buttonUrl(appUrl: string, path: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error('A notification button opens a page of the app');
  }
  return `${appUrl.replace(/\/+$/, '')}${path}`;
}

// Inline styles only: most mail readers drop <style> blocks and every external stylesheet.
const FONT = 'font-family:Arial,Helvetica,sans-serif;color:#1f2937';

export function renderNotification(
  parts: NotificationParts,
  appUrl: string,
): RenderedNotification {
  if (parts.lines.length > MAX_LINES) {
    throw new Error(`A notification holds at most ${MAX_LINES} lines`);
  }
  const hello = greeting(parts.greetingName);
  const url = buttonUrl(appUrl, parts.button.path);

  const text = [
    hello,
    '',
    ...parts.lines,
    '',
    `${parts.button.label}: ${url}`,
    '',
    '--',
    NOTIFICATION_FOOTER,
  ].join('\n');

  const html = [
    `<div style="${FONT};line-height:1.5;max-width:520px">`,
    `<p style="margin:0 0 12px;font-size:14px">${escapeHtml(hello)}</p>`,
    ...parts.lines.map(
      (line) =>
        `<p style="margin:0 0 8px;font-size:14px">${escapeHtml(line)}</p>`,
    ),
    `<p style="margin:20px 0">`,
    `<a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 18px;border-radius:6px;background:#1d4ed8;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none">${escapeHtml(parts.button.label)}</a>`,
    `</p>`,
    `<p style="margin:24px 0 0;padding-top:12px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280">${escapeHtml(NOTIFICATION_FOOTER)}</p>`,
    `</div>`,
  ].join('\n');

  return { text, html };
}

/**
 * A subject of at most 60 characters (AC 7) from a fixed prefix and a name that may be long: the
 * name is cut with an ellipsis. Characters are counted as code points, so an emoji is one and is
 * never cut in half.
 */
export function fitSubject(prefix: string, name: string): string {
  const words = [...name.trim().replace(/\s+/g, ' ')];
  const room = MAX_SUBJECT_LENGTH - [...prefix].length;
  return words.length <= room
    ? `${prefix}${words.join('')}`
    : `${prefix}${words.slice(0, room - 1).join('')}…`;
}
