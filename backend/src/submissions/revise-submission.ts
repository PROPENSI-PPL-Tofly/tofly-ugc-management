import { UnprocessableEntityException } from '@nestjs/common';
import {
  MAX_NOTE_TEXT_LENGTH,
  revisionNoteText,
  sanitizeRevisionNote,
} from './revision-note-html.js';

// The revision note the admin sends (PBI-34): the editor's HTML is sanitized here and its words
// counted without their formatting, so the 1,000-character room is the same however the note is
// written. A note saved before rich text existed stays plain text and reads as it always did
// (AC 9): the HTML column is the formatting, this one is the words.

export { MAX_NOTE_TEXT_LENGTH as MAX_REVISION_NOTES_LENGTH } from './revision-note-html.js';

export interface RevisionRequest {
  /** The note's words, trimmed — the legacy column, and what a plain note shows. */
  revisionNotes: string;
  /** The note as sanitized HTML: only the toolbar's formatting survives (AC 7). */
  revisionNotesHtml: string;
}

function invalidRevisionNotes(
  message = 'Catatan revisi harus berupa teks',
): UnprocessableEntityException {
  return new UnprocessableEntityException({
    message: 'Data revisi tidak valid',
    errors: {
      revisionNotes: message,
    },
  });
}

export function checkRevisionRequest(input: unknown): RevisionRequest {
  if (input === null || input === undefined) {
    throw invalidRevisionNotes();
  }

  const body = input as { revisionNotes: unknown };

  if (typeof body.revisionNotes !== 'string') {
    throw invalidRevisionNotes();
  }

  const revisionNotesHtml = sanitizeRevisionNote(body.revisionNotes.trim());
  const revisionNotes = revisionNoteText(body.revisionNotes).trim();

  if (revisionNotes.length === 0) {
    throw invalidRevisionNotes('Catatan revisi tidak boleh kosong');
  }

  if ([...revisionNotes].length > MAX_NOTE_TEXT_LENGTH) {
    throw invalidRevisionNotes(
      `Catatan revisi maksimal ${MAX_NOTE_TEXT_LENGTH} karakter`,
    );
  }

  return { revisionNotes, revisionNotesHtml };
}
