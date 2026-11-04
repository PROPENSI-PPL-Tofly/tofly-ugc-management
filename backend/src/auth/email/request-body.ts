import { UnprocessableEntityException } from '@nestjs/common';
import {
  checkEmail,
  type NewCreatorErrors,
} from '../../creators/new-creator.js';

/**
 * The email of a code request, trimmed and lower-cased as login_codes stores it. A malformed body
 * is refused before it reaches the whitelist, the rate limit or the table.
 */
export function checkRequestBody(body: unknown): string {
  const { email } = (typeof body === 'object' && body !== null ? body : {}) as {
    email?: unknown;
  };
  const errors: NewCreatorErrors = {};
  const checked = checkEmail(email, errors);
  if (errors.email !== undefined) {
    throw new UnprocessableEntityException({
      message: 'Data tidak valid',
      errors,
    });
  }
  return checked.toLowerCase();
}
