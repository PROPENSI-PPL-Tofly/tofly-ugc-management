import { UnprocessableEntityException } from '@nestjs/common';

export interface RevisionRequest { 
  revisionNotes: string;
}

export function checkRevisionRequest(input: unknown): RevisionRequest { 
  if (input === null) {
    throw new UnprocessableEntityException({
      message: 'Data revisi tidak valid',
      errors: {
        revisionNotes: 'Catatan revisi harus berupa teks',
      },
    });
  }

  const body = input as { revisionNotes: unknown };
  if (typeof body.revisionNotes !== 'string') {
    throw new UnprocessableEntityException({
      message: 'Data revisi tidak valid',
      errors: {
        revisionNotes: 'Catatan revisi harus berupa teks',
      },
    });
  }

  return { revisionNotes: body.revisionNotes };
}
