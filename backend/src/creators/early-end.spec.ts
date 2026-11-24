import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  assertCanEndEarly,
  checkEarlyEnd,
  NOTE_MAX,
  planEarlyEnd,
  reasonMismatch,
  type EarlyEndRequest,
  type EndingContract,
  type PlanContent,
  type PlanPeriod,
} from './early-end.js';

// 10:00 WIB on 24 November 2026; 23:30 WIB the same day is still the 24th in Jakarta.
const NOW = new Date('2026-11-24T03:00:00Z');
const LATE_EVENING = new Date('2026-11-24T16:30:00Z');

function day(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** Period 1, running today: 1 Sep – 15 Des 2026. */
const RUNNING: EndingContract = {
  startDate: day('2026-09-01'),
  endDate: day('2026-12-15'),
  originalEndDate: null,
};

const VALID = {
  invoice: 'pay',
  lastDay: '2026-11-30',
  reason: 'breach',
  note: 'Konten diunggah ulang dari creator lain.',
};

function errorsOf(work: () => unknown): Record<string, string> {
  try {
    work();
  } catch (error) {
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    const body = (error as UnprocessableEntityException).getResponse() as {
      message: string;
      errors: Record<string, string>;
    };
    expect(body.message).toBe('Data pengakhiran kontrak tidak valid');
    return body.errors;
  }
  throw new Error('expected a 422');
}

function conflictOf(work: () => unknown): { code: string; message: string } {
  try {
    work();
  } catch (error) {
    expect(error).toBeInstanceOf(ConflictException);
    return (error as ConflictException).getResponse() as {
      code: string;
      message: string;
    };
  }
  throw new Error('expected a 409');
}

describe('assertCanEndEarly (PBI-37: only while the contract is active)', () => {
  it('lets a running contract be ended', () => {
    expect(() => assertCanEndEarly(RUNNING, NOW)).not.toThrow();
  });

  it('lets it be ended on its first day and on its last day', () => {
    expect(() =>
      assertCanEndEarly({ ...RUNNING, startDate: day('2026-11-24') }, NOW),
    ).not.toThrow();
    expect(() =>
      assertCanEndEarly({ ...RUNNING, endDate: day('2026-11-24') }, LATE_EVENING),
    ).not.toThrow();
  });

  it('refuses a contract another admin already ended, with the prototype words', () => {
    expect(
      conflictOf(() =>
        assertCanEndEarly(
          {
            startDate: day('2026-09-01'),
            endDate: day('2026-11-30'),
            originalEndDate: day('2026-12-15'),
          },
          NOW,
        ),
      ),
    ).toEqual({ code: 'CONTRACT_ALREADY_ENDED', message: 'Kontrak sudah diakhiri' });
  });

  it('refuses a contract that has not started, even one starting tomorrow', () => {
    expect(
      conflictOf(() =>
        assertCanEndEarly({ ...RUNNING, startDate: day('2026-11-25') }, NOW),
      ),
    ).toEqual({ code: 'CONTRACT_NOT_STARTED', message: 'Kontrak belum dimulai' });
  });

  it('refuses a contract that ended yesterday', () => {
    expect(
      conflictOf(() =>
        assertCanEndEarly({ ...RUNNING, endDate: day('2026-11-23') }, NOW),
      ),
    ).toEqual({ code: 'CONTRACT_ENDED', message: 'Kontrak sudah berakhir' });
  });
});

describe('checkEarlyEnd (the "Akhiri Kontrak Lebih Awal" form)', () => {
  it('accepts the form and trims the note', () => {
    expect(
      checkEarlyEnd({ ...VALID, note: '  Fraud views.  ' }, RUNNING, NOW),
    ).toEqual<EarlyEndRequest>({
      invoice: 'pay',
      lastDay: '2026-11-30',
      reason: 'breach',
      note: 'Fraud views.',
    });
  });

  it.each(['breach', 'fraud', 'other'] as const)('accepts the reason %s', (reason) => {
    expect(checkEarlyEnd({ ...VALID, reason }, RUNNING, NOW).reason).toBe(reason);
  });

  it('accepts today, the earliest last day', () => {
    expect(checkEarlyEnd({ ...VALID, lastDay: '2026-11-24' }, RUNNING, NOW).lastDay).toBe(
      '2026-11-24',
    );
  });

  it('accepts the day before the original end, the latest last day', () => {
    expect(checkEarlyEnd({ ...VALID, lastDay: '2026-12-14' }, RUNNING, NOW).lastDay).toBe(
      '2026-12-14',
    );
  });

  it('judges today in Jakarta, so 23:30 WIB still accepts that day', () => {
    expect(
      checkEarlyEnd({ ...VALID, lastDay: '2026-11-24' }, RUNNING, LATE_EVENING).lastDay,
    ).toBe('2026-11-24');
  });

  it('refuses yesterday and the original end itself, naming the window', () => {
    const message = 'Pilih antara 24 Nov 2026 dan 14 Des 2026';
    expect(errorsOf(() => checkEarlyEnd({ ...VALID, lastDay: '2026-11-23' }, RUNNING, NOW))).toEqual({
      lastDay: message,
    });
    expect(errorsOf(() => checkEarlyEnd({ ...VALID, lastDay: '2026-12-15' }, RUNNING, NOW))).toEqual({
      lastDay: message,
    });
  });

  it('never lets the last day come before the start: the window opens on the start day', () => {
    const fresh = { ...RUNNING, startDate: day('2026-11-24') };
    expect(checkEarlyEnd({ ...VALID, lastDay: '2026-11-24' }, fresh, NOW).lastDay).toBe('2026-11-24');
  });

  it.each([
    ['missing', undefined],
    ['blank', ''],
    ['not a day', '30-11-2026'],
    ['a day that does not exist', '2026-02-30'],
    ['not a string', 20261130],
  ])('asks for the last day when it is %s', (_, lastDay) => {
    expect(errorsOf(() => checkEarlyEnd({ ...VALID, lastDay }, RUNNING, NOW))).toEqual({
      lastDay: 'Hari terakhir wajib diisi',
    });
  });

  it('locks the last day to today when the invoice is cancelled, whatever was sent', () => {
    expect(
      checkEarlyEnd({ ...VALID, invoice: 'cancel', lastDay: '2026-12-10' }, RUNNING, NOW),
    ).toEqual<EarlyEndRequest>({
      invoice: 'cancel',
      lastDay: '2026-11-24',
      reason: 'breach',
      note: VALID.note,
    });
    expect(
      checkEarlyEnd({ ...VALID, invoice: 'cancel', lastDay: undefined }, RUNNING, NOW).lastDay,
    ).toBe('2026-11-24');
  });

  it('on the original end day only a cancel is left: no day before the end remains', () => {
    const endsToday = { ...RUNNING, endDate: day('2026-11-24') };
    expect(checkEarlyEnd({ ...VALID, invoice: 'cancel' }, endsToday, NOW).lastDay).toBe(
      '2026-11-24',
    );
    expect(
      errorsOf(() => checkEarlyEnd({ ...VALID, lastDay: '2026-11-24' }, endsToday, NOW)),
    ).toEqual({ lastDay: 'Tidak ada hari terakhir sebelum kontrak berakhir. Pilih Batalkan Invoice.' });
  });

  it.each([undefined, '', 'refund', ['pay']])('asks for the invoice choice when it is %j', (invoice) => {
    expect(errorsOf(() => checkEarlyEnd({ ...VALID, invoice }, RUNNING, NOW))).toEqual({
      invoice: 'Pilih Invoice Periode Ini',
    });
  });

  it.each([undefined, '', 'violation', 3])('asks for the reason when it is %j', (reason) => {
    expect(errorsOf(() => checkEarlyEnd({ ...VALID, reason }, RUNNING, NOW))).toEqual({
      reason: 'Pilih alasan',
    });
  });

  it.each([undefined, '', '   ', 42])('asks for the note when it is %j', (note) => {
    expect(errorsOf(() => checkEarlyEnd({ ...VALID, note }, RUNNING, NOW))).toEqual({
      note: 'Catatan wajib diisi',
    });
  });

  it('takes a note of exactly 500 characters and refuses 501', () => {
    expect(checkEarlyEnd({ ...VALID, note: 'a'.repeat(NOTE_MAX) }, RUNNING, NOW).note).toHaveLength(500);
    expect(errorsOf(() => checkEarlyEnd({ ...VALID, note: 'a'.repeat(NOTE_MAX + 1) }, RUNNING, NOW))).toEqual({
      note: 'Catatan maksimal 500 karakter',
    });
  });

  it('counts the note after trimming, so 500 characters with spaces around still fit', () => {
    expect(checkEarlyEnd({ ...VALID, note: ` ${'a'.repeat(500)} ` }, RUNNING, NOW).note).toHaveLength(500);
  });

  it('reports every field at once, and reads a missing body as a blank form', () => {
    expect(errorsOf(() => checkEarlyEnd(undefined, RUNNING, NOW))).toEqual({
      invoice: 'Pilih Invoice Periode Ini',
      reason: 'Pilih alasan',
      note: 'Catatan wajib diisi',
    });
    expect(errorsOf(() => checkEarlyEnd(null, RUNNING, NOW))).toEqual({
      invoice: 'Pilih Invoice Periode Ini',
      reason: 'Pilih alasan',
      note: 'Catatan wajib diisi',
    });
  });
});

describe('reasonMismatch (the warning on the confirmation)', () => {
  it.each([
    ['breach', 'pay', true],
    ['fraud', 'pay', true],
    ['other', 'cancel', true],
    ['breach', 'cancel', false],
    ['fraud', 'cancel', false],
    ['other', 'pay', false],
  ] as const)('%s with %s warns: %s', (reason, invoice, warns) => {
    expect(reasonMismatch({ reason, invoice })).toBe(warns);
  });
});

describe('planEarlyEnd (the consequences, for the confirmation and the write alike)', () => {
  const PERIOD_1: PlanPeriod = {
    id: 'contract-1',
    startDate: day('2026-03-01'),
    endDate: day('2026-08-31'),
    invoiceStatus: 'paid',
  };
  const PERIOD_2: PlanPeriod = {
    id: 'contract-2',
    startDate: day('2026-09-01'),
    endDate: day('2026-12-15'),
    invoiceStatus: null,
  };
  const PERIOD_3: PlanPeriod = {
    id: 'contract-3',
    startDate: day('2026-12-16'),
    endDate: day('2027-03-15'),
    invoiceStatus: 'running',
  };

  function content(
    id: string,
    deadline: string,
    status: PlanContent['status'] = 'scheduled',
  ): PlanContent {
    return { id, name: `Evg_${id}`, deadline: day(deadline), status };
  }

  const PAY: EarlyEndRequest = { ...VALID, invoice: 'pay', reason: 'breach' } as EarlyEndRequest;
  const CANCEL: EarlyEndRequest = { ...PAY, invoice: 'cancel', lastDay: '2026-11-24' };

  it('closes content due after the last day and lists what is still open up to it', () => {
    const plan = planEarlyEnd(
      PAY,
      'contract-2',
      [PERIOD_1, PERIOD_2],
      [
        content('done-late', '2026-12-10', 'link_submitted'),
        content('due-last-day', '2026-11-30', 'draft_review'),
        content('due-next-day', '2026-12-01'),
        content('done', '2026-11-10', 'link_submitted'),
        content('proposal', '2026-12-05', 'pending'),
      ],
      NOW,
    );

    expect(plan.closing).toEqual([
      { id: 'due-next-day', name: 'Evg_due-next-day', deadline: '2026-12-01' },
      { id: 'proposal', name: 'Evg_proposal', deadline: '2026-12-05' },
    ]);
    expect(plan.unfinished).toEqual([
      { id: 'due-last-day', name: 'Evg_due-last-day', deadline: '2026-11-30' },
    ]);
  });

  it('keeps the invoice payable from the day after the last day, with access until it is paid', () => {
    expect(planEarlyEnd(PAY, 'contract-2', [PERIOD_1, PERIOD_2], [], NOW)).toEqual({
      lastDay: '2026-11-30',
      originalEndDate: '2026-12-15',
      invoice: 'pay',
      reasonMismatch: true,
      finalizableFrom: '2026-12-01',
      closing: [],
      unfinished: [],
      deletedPeriods: [],
      access: 'after_invoice_paid',
    });
  });

  it('cancelling closes access now when no earlier invoice is still unpaid', () => {
    const plan = planEarlyEnd(CANCEL, 'contract-2', [PERIOD_1, PERIOD_2], [], NOW);
    expect(plan).toMatchObject({
      lastDay: '2026-11-24',
      finalizableFrom: null,
      reasonMismatch: false,
      access: 'closed_now',
    });
  });

  it.each(['running', 'finalized', 'creator_acked', 'payment_uploaded', null] as const)(
    'cancelling waits for an earlier invoice that is %s',
    (invoiceStatus) => {
      const plan = planEarlyEnd(
        CANCEL,
        'contract-2',
        [{ ...PERIOD_1, invoiceStatus }, PERIOD_2],
        [],
        NOW,
      );
      expect(plan.access).toBe('after_previous_invoice_paid');
    },
  );

  it('an earlier cancelled invoice keeps nothing open', () => {
    const plan = planEarlyEnd(
      CANCEL,
      'contract-2',
      [{ ...PERIOD_1, invoiceStatus: 'cancelled' }, PERIOD_2],
      [],
      NOW,
    );
    expect(plan.access).toBe('closed_now');
  });

  it('deletes every period that has not started, numbered as Creator Detail numbers them', () => {
    const plan = planEarlyEnd(
      CANCEL,
      'contract-2',
      [PERIOD_1, PERIOD_2, PERIOD_3],
      [],
      NOW,
    );
    expect(plan.deletedPeriods).toEqual([
      {
        contractId: 'contract-3',
        periodNumber: 3,
        startDate: '2026-12-16',
        endDate: '2027-03-15',
      },
    ]);
    // A period that is deleted never keeps the creator's access open.
    expect(plan.access).toBe('closed_now');
  });

  it('numbers periods by start whatever order they arrive in', () => {
    const plan = planEarlyEnd(PAY, 'contract-2', [PERIOD_3, PERIOD_2, PERIOD_1], [], NOW);
    expect(plan.deletedPeriods.map((period) => period.periodNumber)).toEqual([3]);
  });

  it('a period starting today has started and is kept', () => {
    const plan = planEarlyEnd(
      PAY,
      'contract-2',
      [PERIOD_2, { ...PERIOD_3, startDate: day('2026-11-24') }],
      [],
      NOW,
    );
    expect(plan.deletedPeriods).toEqual([]);
  });
});
