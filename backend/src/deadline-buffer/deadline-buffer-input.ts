// The "Atur Buffer Deadline" body (PBI-23 AC 20, SCRUM-298), checked before anything is read or
// written: a JSON whole number from 1 to 14 and no other field, nothing coerced (OWASP A05:2025).

import { UnprocessableEntityException } from '@nestjs/common';
import { isBufferDays } from './deadline-window.js';

function refuse(errors: Record<string, string>): never {
  throw new UnprocessableEntityException({
    message: 'Data buffer deadline tidak valid',
    errors,
  });
}

export function checkBufferDays(body: unknown): number {
  const fields =
    typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  const { bufferDays, ...rest } = fields;

  if (bufferDays === undefined || bufferDays === null) {
    refuse({ bufferDays: 'Isi buffer deadline' });
  }
  if (!isBufferDays(bufferDays)) {
    refuse({ bufferDays: 'Isi angka bulat 1–14' });
  }
  if (Object.keys(rest).length > 0) {
    refuse({ body: 'Hanya buffer deadline yang bisa diubah' });
  }
  return bufferDays;
}
