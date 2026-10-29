import { UnprocessableEntityException } from '@nestjs/common';

export interface CreatorComment {
  comment: string;
}

/** A separate comment action; draft creator_notes remain independent. */
export function checkCreatorComment(input: unknown): CreatorComment {
  const comment =
    input !== null && typeof input === 'object' && !Array.isArray(input)
      ? (input as Record<string, unknown>).comment
      : undefined;

  if (typeof comment !== 'string' || comment.trim() === '') {
    throw new UnprocessableEntityException({
      message: 'Data komentar tidak valid',
      errors: { comment: 'Wajib diisi' },
    });
  }

  return { comment: comment.trim() };
}
