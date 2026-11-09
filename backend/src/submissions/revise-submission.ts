import { UnprocessableEntityException } from '@nestjs/common';
import {
  MAX_NOTE_TEXT_LENGTH,
  revisionNoteLength,
  revisionNoteText,
  sanitizeRevisionNote,
} from './revision-note-html.js';
import { MAX_NOTE_IMAGES } from './revision-note-image-file.js';

// The revision note the admin sends (PBI-34): the editor's HTML is sanitized here and its words
// counted without their formatting, so the 1,000-character room is the same however the note is
// written. A note saved before rich text existed stays plain text and reads as it always did
// (AC 9): the HTML column is the formatting, this one is the words. The screenshots go out by
// name — exactly the ones the editor holds, so an upload left behind is never sent to the
// creator (review).

export { MAX_NOTE_TEXT_LENGTH as MAX_REVISION_NOTES_LENGTH } from './revision-note-html.js';

export interface RevisionRequest {
  /** The note's words, trimmed — the legacy column, and what a plain note shows. */
  revisionNotes: string;
  /** The note as sanitized HTML: only the toolbar's formatting survives (AC 7). */
  revisionNotesHtml: string;
  /** The images the editor sends the note with; absent when there are none. */
  imageIds?: string[];
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

/** A refused image list, worded per the reason (AC 4's limit, or names that are not names). */
export function invalidRevisionImages(
  message = 'Gambar tidak ditemukan pada catatan ini',
): UnprocessableEntityException {
  return new UnprocessableEntityException({
    message: 'Data revisi tidak valid',
    errors: {
      imageIds: message,
    },
  });
}

function checkedImageIds(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((id) => typeof id !== 'string')) {
    throw invalidRevisionImages('Gambar tidak valid');
  }
  const imageIds = [...new Set(value as string[])];
  if (imageIds.length > MAX_NOTE_IMAGES) {
    throw invalidRevisionImages('Maksimal 5 gambar per catatan');
  }
  return imageIds;
}

export function checkRevisionRequest(input: unknown): RevisionRequest {
  if (input === null || input === undefined) {
    throw invalidRevisionNotes();
  }

  const body = input as { revisionNotes: unknown; imageIds?: unknown };

  if (typeof body.revisionNotes !== 'string') {
    throw invalidRevisionNotes();
  }

  const revisionNotesHtml = sanitizeRevisionNote(body.revisionNotes.trim());
  const revisionNotes = revisionNoteText(body.revisionNotes).trim();

  if (revisionNotes.length === 0) {
    throw invalidRevisionNotes('Catatan revisi tidak boleh kosong');
  }

  if (revisionNoteLength(body.revisionNotes) > MAX_NOTE_TEXT_LENGTH) {
    throw invalidRevisionNotes(
      `Catatan revisi maksimal ${MAX_NOTE_TEXT_LENGTH} karakter`,
    );
  }

  const imageIds = checkedImageIds(body.imageIds);

  return {
    revisionNotes,
    revisionNotesHtml,
    ...(imageIds.length > 0 && { imageIds }),
  };
}
