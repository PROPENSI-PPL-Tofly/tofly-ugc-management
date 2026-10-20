import { UnprocessableEntityException } from '@nestjs/common';

/** The longest comment, in characters, as varchar(500) counts them. */
export const COMMENT_MAX_LENGTH = 500;

export interface InvoiceCommentInput {
  text: string;
}

function invalid(message: string): UnprocessableEntityException {
  return new UnprocessableEntityException({ code: 'COMMENT_INVALID', message });
}

/**
 * Strict boundary validation: the body carries the text and nothing else, so the author, their
 * role and the time stay server controlled.
 */
export function checkInvoiceComment(body: unknown): InvoiceCommentInput {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw invalid('Data komentar tidak valid');
  }
  if (Object.keys(body).some((key) => key !== 'text')) {
    throw invalid('Data komentar tidak valid');
  }

  const { text } = body as Record<string, unknown>;
  const trimmed = typeof text === 'string' ? text.trim() : '';

  if (trimmed === '') throw invalid('Komentar wajib diisi');
  if (Array.from(trimmed).length > COMMENT_MAX_LENGTH) {
    throw invalid(`Komentar maksimal ${COMMENT_MAX_LENGTH} karakter`);
  }

  return { text: trimmed };
}
