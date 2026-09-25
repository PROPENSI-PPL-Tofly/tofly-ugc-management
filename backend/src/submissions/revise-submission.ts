import { UnprocessableEntityException } from '@nestjs/common';

export interface RevisionRequest {
  revisionNotes: string;
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

  if (body.revisionNotes.trim().length === 0) {
    throw invalidRevisionNotes('Catatan revisi tidak boleh kosong');
  }

  return {
    revisionNotes: body.revisionNotes,
  };
}