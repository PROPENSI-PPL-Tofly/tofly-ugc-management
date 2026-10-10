import { UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  MAX_REJECT_REASON_LENGTH,
  checkRejectReason,
  schedulingCutoff,
} from './proposal-review.js';

describe('checkRejectReason', () => {
  it('reads a missing body, a missing reason and a blank reason as no reason', () => {
    expect(checkRejectReason(undefined)).toEqual({ reason: null });
    expect(checkRejectReason({})).toEqual({ reason: null });
    expect(checkRejectReason({ reason: null })).toEqual({ reason: null });
    expect(checkRejectReason({ reason: '   ' })).toEqual({ reason: null });
  });

  it('keeps a written reason, trimmed', () => {
    expect(checkRejectReason({ reason: '  Kurang relevan dengan kampanye.  ' })).toEqual({
      reason: 'Kurang relevan dengan kampanye.',
    });
  });

  it('accepts a reason of exactly the limit and refuses one character more', () => {
    const atLimit = 'a'.repeat(MAX_REJECT_REASON_LENGTH);
    expect(checkRejectReason({ reason: atLimit })).toEqual({ reason: atLimit });

    expect(() =>
      checkRejectReason({ reason: `${atLimit}a` }),
    ).toThrow(UnprocessableEntityException);
  });

  it('counts the limit after trimming, so padding never pushes a reason over it', () => {
    const atLimit = 'a'.repeat(MAX_REJECT_REASON_LENGTH);
    expect(checkRejectReason({ reason: `  ${atLimit}  ` })).toEqual({ reason: atLimit });
  });

  it.each([[42], [['alasan']], [{ text: 'alasan' }], [true]])(
    'refuses a reason that is not text (%j) with a field error',
    (reason) => {
      try {
        checkRejectReason({ reason });
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(UnprocessableEntityException);
        expect((error as UnprocessableEntityException).getResponse()).toEqual({
          message: 'Data penolakan tidak valid',
          errors: { reason: 'Alasan harus berupa teks' },
        });
      }
    },
  );

  it('refuses a body that is not an object', () => {
    expect(() => checkRejectReason('alasan')).toThrow(UnprocessableEntityException);
    expect(() => checkRejectReason(['alasan'])).toThrow(UnprocessableEntityException);
  });

  it('names the length limit in its message', () => {
    try {
      checkRejectReason({ reason: 'a'.repeat(MAX_REJECT_REASON_LENGTH + 1) });
      expect.unreachable();
    } catch (error) {
      expect((error as UnprocessableEntityException).getResponse()).toEqual({
        message: 'Data penolakan tidak valid',
        errors: { reason: `Alasan maksimal ${MAX_REJECT_REASON_LENGTH} karakter` },
      });
    }
  });
});

describe('schedulingCutoff', () => {
  // H-1: a proposal whose deadline is tomorrow (or earlier) counts as scheduled from today.
  it('is midnight UTC of the day after today in Jakarta', () => {
    // 10 Oct 2026, 12.00 WIB.
    expect(schedulingCutoff(new Date('2026-10-10T05:00:00.000Z'))).toEqual(
      new Date('2026-10-11T00:00:00.000Z'),
    );
  });

  it('already counts the next Jakarta day after 00.00 WIB, while UTC is still on the day before', () => {
    // 11 Oct 2026, 00.30 WIB is 10 Oct 17.30 UTC.
    expect(schedulingCutoff(new Date('2026-10-10T17:30:00.000Z'))).toEqual(
      new Date('2026-10-12T00:00:00.000Z'),
    );
  });

  it('rolls over a month end', () => {
    expect(schedulingCutoff(new Date('2026-10-31T05:00:00.000Z'))).toEqual(
      new Date('2026-11-01T00:00:00.000Z'),
    );
  });
});
