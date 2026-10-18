import { UnprocessableEntityException } from '@nestjs/common';
import { checkManualAdjustment } from './manual-adjustment.js';

/** The per-field errors of the 422 the validator throws for `body`. */
function errorsFor(body: unknown): Record<string, string> {
  try {
    checkManualAdjustment(body);
  } catch (error) {
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    const response = (error as UnprocessableEntityException).getResponse();
    expect(response).toMatchObject({ message: 'Data penyesuaian tidak valid' });
    return (response as { errors: Record<string, string> }).errors;
  }
  return expect.unreachable('the adjustment must be rejected');
}

const AMOUNT_ERROR = 'Jumlah harus bukan nol dan maksimal dua angka desimal';

describe('checkManualAdjustment', () => {
  it.each([25_000, -75_000, 0.01, -1500.5, 99.99])(
    'accepts the nonzero amount %d with at most two decimals',
    (amount) => {
      expect(checkManualAdjustment({ amount, reason: 'Koreksi' })).toEqual({
        amount,
        reason: 'Koreksi',
      });
    },
  );

  it('trims the reason before it is saved', () => {
    expect(
      checkManualAdjustment({ amount: 10, reason: '  Approved campaign  ' }),
    ).toEqual({ amount: 10, reason: 'Approved campaign' });
  });

  it('counts the 500-character limit in characters, not UTF-16 units', () => {
    const reason = '😀'.repeat(500);

    expect(checkManualAdjustment({ amount: 1, reason }).reason).toBe(reason);
    expect(errorsFor({ amount: 1, reason: `${reason}😀` })).toEqual({
      reason: 'Alasan maksimal 500 karakter',
    });
  });

  it('measures the limit after trimming', () => {
    const reason = 'R'.repeat(500);

    expect(
      checkManualAdjustment({ amount: 1, reason: `  ${reason}  ` }),
    ).toEqual({ amount: 1, reason });
  });

  it.each([
    ['null', null],
    ['an array', [{ amount: 1, reason: 'Koreksi' }]],
    ['a string', 'amount=1'],
    ['missing', undefined],
  ])('rejects a body that is %s', (_case, body) => {
    expect(errorsFor(body)).toEqual({ body: 'Data penyesuaian tidak valid' });
  });

  // OWASP Top 10:2025 A01 (Broken Access Control): actor, time and lifecycle stay server controlled.
  it('rejects every client-supplied field besides amount and reason', () => {
    expect(
      errorsFor({
        amount: 10,
        reason: 'Koreksi',
        actorId: 'admin-2',
        createdAt: '2000-01-01T00:00:00.000Z',
        invoiceStatus: 'finalized',
      }),
    ).toEqual({
      actorId: 'Field ini tidak dapat dikirim',
      createdAt: 'Field ini tidak dapat dikirim',
      invoiceStatus: 'Field ini tidak dapat dikirim',
    });
  });

  // OWASP Top 10:2025 A05 (Injection) and A10 (Mishandling of Exceptional Conditions).
  it.each([
    ['missing', undefined],
    ['a numeric string', '25000'],
    ['zero', 0],
    ['negative zero', -0],
    ['NaN', Number.NaN],
    ['infinite', Number.POSITIVE_INFINITY],
    ['three decimals', 1.234],
    ['a negative with three decimals', -0.001],
  ])('rejects an amount that is %s', (_case, amount) => {
    expect(errorsFor({ amount, reason: 'Koreksi' })).toEqual({
      amount: AMOUNT_ERROR,
    });
  });

  it.each([
    ['missing', undefined],
    ['not text', 123],
    ['empty', ''],
    ['only whitespace', ' \t\n '],
  ])('requires a reason, rejecting one that is %s', (_case, reason) => {
    expect(errorsFor({ amount: 10, reason })).toEqual({
      reason: 'Alasan wajib diisi',
    });
  });

  it('reports every invalid field in one response', () => {
    expect(errorsFor({ amount: 0, reason: ' ', total: 1 })).toEqual({
      total: 'Field ini tidak dapat dikirim',
      amount: AMOUNT_ERROR,
      reason: 'Alasan wajib diisi',
    });
  });
});
