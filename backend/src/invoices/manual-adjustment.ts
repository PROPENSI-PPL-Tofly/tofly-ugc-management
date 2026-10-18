import { UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

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
    !Number.isFinite(amount) ||
    amount === 0 ||
    new Prisma.Decimal(amount).decimalPlaces() > 2
  ) {
    errors.amount = 'Jumlah harus bukan nol dan maksimal dua angka desimal';
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
