import { UnprocessableEntityException } from '@nestjs/common';

export interface RevisionRequest {
  revisionNotes: string;
}

/** Room for a clear request; keeps a hostile body from filling submissions.revision_notes. */
export const MAX_REVISION_NOTES_LENGTH = 1000;

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

  const revisionNotes = body.revisionNotes.trim();

  if (revisionNotes.length === 0) {
    throw invalidRevisionNotes('Catatan revisi tidak boleh kosong');
  }

  if (revisionNotes.length > MAX_REVISION_NOTES_LENGTH) {
    throw invalidRevisionNotes(
      `Catatan revisi maksimal ${MAX_REVISION_NOTES_LENGTH} karakter`,
    );
  }

  return { revisionNotes };
}