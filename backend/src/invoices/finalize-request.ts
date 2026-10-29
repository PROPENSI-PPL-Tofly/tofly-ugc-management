import { UnprocessableEntityException } from '@nestjs/common';

export interface FinalizeRequest {
  /** The admin saw that the performance bonus still waits for data and freezes it anyway. */
  acceptPendingBonus: boolean;
}

/** Strict boundary validation: the snapshot, status and instant stay server controlled. */
export function checkFinalizeRequest(body: unknown): FinalizeRequest {
  if (body === undefined) return { acceptPendingBonus: false };
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw invalid({ body: 'Data finalisasi tidak valid' });
  }

  const input = body as Record<string, unknown>;
  const errors: Record<string, string> = {};
  for (const key of Object.keys(input)) {
    if (key !== 'acceptPendingBonus') {
      errors[key] = 'Field ini tidak dapat dikirim';
    }
  }

  const accept = input.acceptPendingBonus;
  if (accept !== undefined && typeof accept !== 'boolean') {
    errors.acceptPendingBonus = 'Harus berupa true atau false';
  }

  if (Object.keys(errors).length > 0) throw invalid(errors);

  return { acceptPendingBonus: accept === true };
}

function invalid(errors: Record<string, string>): UnprocessableEntityException {
  return new UnprocessableEntityException({
    message: 'Data finalisasi tidak valid',
    errors,
  });
}
