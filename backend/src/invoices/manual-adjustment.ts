import { UnprocessableEntityException } from '@nestjs/common';
import { MAX_FIXED_RATE } from '../creators/new-creator.js';

/** One adjustment moves an invoice by at most a whole contract's fixed-rate cap, either way. */
export const MAX_ADJUSTMENT = MAX_FIXED_RATE;

export interface ManualAdjustmentInput {
  amount: number;
  reason: string;
}

/** Strict boundary validation keeps actor and lifecycle fields server controlled. */
export function checkManualAdjustment(body: unknown): ManualAdjustmentInput {
  const errors: Record<string, string> = {};
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw invalid({ body: 'Data penyesuaian tidak valid' });
  }

  const input = body as Record<string, unknown>;
  for (const key of Object.keys(input)) {
    if (key !== 'amount' && key !== 'reason') {
      errors[key] = 'Field ini tidak dapat dikirim';
    }
  }

  const amount = input.amount;
  if (
    typeof amount !== 'number' ||
    !Number.isInteger(amount) ||
    amount === 0
  ) {
    errors.amount = 'Jumlah harus angka bulat dan bukan nol';
  } else if (Math.abs(amount) > MAX_ADJUSTMENT) {
    // Checked before anything stores it: past 2^53 a number has already been rounded on parse.
    errors.amount = 'Jumlah maksimal Rp10.000.000 per penyesuaian';
  }

  const reason = input.reason;
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    errors.reason = 'Alasan wajib diisi';
  } else if (Array.from(reason.trim()).length > 500) {
    errors.reason = 'Alasan maksimal 500 karakter';
  }

  if (Object.keys(errors).length > 0) throw invalid(errors);

  return { amount: amount as number, reason: (reason as string).trim() };
}

function invalid(errors: Record<string, string>): UnprocessableEntityException {
  return new UnprocessableEntityException({
    message: 'Data penyesuaian tidak valid',
    errors,
  });
}
