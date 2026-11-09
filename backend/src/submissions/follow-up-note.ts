import { UnprocessableEntityException } from '@nestjs/common';
import {
  revisionNoteLength,
  revisionNoteText,
  sanitizeRevisionNote,
} from './revision-note-html.js';

// A follow-up note (PBI-33, 33.1): what an admin adds under a revision note already sent. It gets
// the same room as the revision note it adds to (AC 2), counted once the spaces around it are
// gone, so a note of only spaces is empty.

/** The longest follow-up, the same as the revision note's limit. */
export const MAX_FOLLOW_UP_LENGTH = 1000;

export interface FollowUpRequest {
  /** The follow-up's words, without formatting. */
  note: string;
  /**
   * The follow-up as the revision note's editor wrote it (PBI-34), sanitized with the same
   * allowlist as the note; absent for plain text, which needs no formatting kept.
   */
  noteHtml?: string;
}

/** Whether the note came from the rich text editor rather than as plain words. */
function isFormatted(note: string): boolean {
  return /<[a-z][^>]*>/i.test(note);
}

// 422 with the reason under `note`, the field the admin's form (33.2) shows it beside.
function invalidFollowUp(reason: string): UnprocessableEntityException {
  return new UnprocessableEntityException({
    message: 'Data catatan susulan tidak valid',
    errors: { note: reason },
  });
}

export function checkFollowUp(input: unknown): FollowUpRequest {
  const note = (input as { note?: unknown } | null | undefined)?.note;
  if (typeof note !== 'string') {
    throw invalidFollowUp('Catatan susulan harus berupa teks');
  }

  const formatted = isFormatted(note);
  const trimmed = formatted ? revisionNoteText(note) : note.trim();
  if (trimmed.length === 0) {
    throw invalidFollowUp('Catatan susulan tidak boleh kosong');
  }
  // Counted on the words, as the revision note is, so formatting never uses up the room.
  const length = formatted ? revisionNoteLength(note) : trimmed.length;
  if (length > MAX_FOLLOW_UP_LENGTH) {
    throw invalidFollowUp(
      `Catatan susulan maksimal ${MAX_FOLLOW_UP_LENGTH} karakter`,
    );
  }

  return formatted
    ? { note: trimmed, noteHtml: sanitizeRevisionNote(note.trim()) }
    : { note: trimmed };
}
