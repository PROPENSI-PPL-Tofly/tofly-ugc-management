import { UnprocessableEntityException } from '@nestjs/common';

export interface RevisionRequest {
  revisionNotes: string;
}

function invalidRevisionNotes(): UnprocessableEntityException {
  return new UnprocessableEntityException({
    message: 'Data revisi tidak valid',
    errors: {
      revisionNotes: 'Catatan revisi harus berupa teks',
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

  return { revisionNotes: body.revisionNotes };
}
