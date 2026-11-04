import { UnprocessableEntityException } from '@nestjs/common';
import {
  checkEmail,
  type NewCreatorErrors,
} from '../../creators/new-creator.js';

export interface RequestBody {
  /** Trimmed and lower-cased, as login_codes stores it. */
  email: string;
}

/** Refuses a malformed body before it reaches the whitelist or the hourly limit. */
export function checkRequestBody(body: unknown): RequestBody {
  const fields = (typeof body === 'object' && body !== null ? body : {}) as {
    email?: unknown;
  };
  const errors: NewCreatorErrors = {};
  const email = checkEmail(fields.email, errors);
  if (errors.email !== undefined) {
    throw new UnprocessableEntityException({
      message: 'Data tidak valid',
      errors,
    });
  }
  return { email: email.toLowerCase() };
}
