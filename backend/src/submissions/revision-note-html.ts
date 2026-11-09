import sanitizeHtml from 'sanitize-html';

// The revision note as rich text (PBI-34, AC 7): what arrives from the admin's editor is
// sanitized here, on the server, before anything is stored — the allowlist is the whole
// language the note may speak, so a script or an unknown tag can never reach the creator's
// browser however the request was made.

/** Everything the toolbar of the revision editor can make (AC 1), and nothing else. */
const ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'a'];

const ALLOWED_ATTRIBUTES: { [index: string]: string[] } = {
  a: ['href', 'rel'],
};

/** A link may leave the site, but only over http or https. */
const ALLOWED_SCHEMES = ['http', 'https'];

/** Room for a clear request; counted on the words, not on their formatting (AC 2). */
export const MAX_NOTE_TEXT_LENGTH = 1000;

/** The note as stored and shown: only allowlisted formatting survives. */
export function sanitizeRevisionNote(input: string): string {
  return sanitizeHtml(input, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ALLOWED_SCHEMES,
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', {
        rel: 'noopener noreferrer nofollow',
      }),
    },
  });
}

/** The escapes sanitize-html writes for the five characters it never lets through as-is. */
const ESCAPES: readonly (readonly [string, string])[] = [
  ['&lt;', '<'],
  ['&gt;', '>'],
  ['&quot;', '"'],
  ['&#39;', "'"],
  ['&apos;', "'"],
  ['&amp;', '&'],
];

/** Block boundaries become line breaks before the tags are dropped, so words stay apart. */
const BREAKS: readonly RegExp[] = [/<\/p>/gi, /<\/li>/gi, /<br\s*\/?>/gi];

/** The note's words without any formatting: what the counter counts (AC 2). */
export function revisionNoteText(input: string): string {
  const withBreaks = BREAKS.reduce(
    (text, pattern) => text.replaceAll(pattern, '\n'),
    input,
  );
  const escaped = sanitizeHtml(withBreaks, {
    allowedTags: [],
    allowedAttributes: {},
  });
  // The sanitizer re-escapes the text it keeps; the words are what remains once each escape
  // is read as the character it stands for, so "&amp;" counts as one character, not five.
  return ESCAPES.reduce(
    (text, [from, to]) => text.replaceAll(from, to),
    escaped,
  ).trim();
}

/**
 * The note's length in Unicode characters, not UTF-16 units — an emoji is one character. The
 * line breaks kept between paragraphs, list items and lines are not counted. Paragraphs and list
 * items are then counted as the editor's counter (34.2) counts them; where the two still differ
 * (a Shift+Enter line or an emoji, which the editor counts as one more), the editor is the
 * stricter, so a note it shows within 1,000 is never refused here.
 */
export function revisionNoteLength(input: string): number {
  return [...revisionNoteText(input).replaceAll('\n', '')].length;
}
