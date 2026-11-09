import { UnprocessableEntityException } from '@nestjs/common';
import {
  checkEmail,
  type NewCreatorErrors,
} from '../../creators/new-creator.js';

const CODE_FORMAT = /^\d{6}$/;

export interface VerifyBody {
  /** Trimmed and lower-cased, as login_codes stores it. */
  email: string;
  code: string;
}

/** Refuses a malformed body before it can reach a code, so it never spends an attempt. */
export function checkVerifyBody(body: unknown): VerifyBody {
  const fields = (typeof body === 'object' && body !== null ? body : {}) as {
    email?: unknown;
    code?: unknown;
  };
  const errors: NewCreatorErrors = {};
  const email = checkEmail(fields.email, errors);
  const { code } = fields;
  if (typeof code !== 'string' || !CODE_FORMAT.test(code)) {
    errors.code = 'Kode harus 6 digit';
  }
  if (Object.keys(errors).length > 0) {
    throw new UnprocessableEntityException({
      message: 'Data tidak valid',
      errors,
    });
  }
  return { email: email.toLowerCase(), code: code as string };
}
