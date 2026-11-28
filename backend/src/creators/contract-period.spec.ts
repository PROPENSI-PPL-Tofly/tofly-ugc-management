import { UnprocessableEntityException } from '@nestjs/common';
import {
  checkNewPeriod,
  overlappingPeriod,
  periodHasStarted,
  specificOutsidePeriod,
  waitingPeriod,
} from './contract-period.js';
import { DEFAULT_BUFFER_DAYS } from '../deadline-buffer/deadline-window.js';

// 10:00 WIB on 18 November 2026.
const NOW = new Date('2026-11-18T03:00:00Z');

function day(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** A period that starts the day after a contract ending on 30 November. */
const BODY = {
  contractType: 'regular',
  contractStart: '2026-12-01',
  contractEnd: '2027-01-31',
  interval: 14,
  quota: 2,
  fixedRate: 1_500_000,
  deadlines: ['2026-12-20', '2026-12-06'],
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
    expect(body.message).toBe('Data periode tidak valid');
    return body.errors;
  }
  throw new Error('expected a 422');
}

describe('checkNewPeriod', () => {
  it('turns a valid body into the contract to save, deadlines in date order', () => {
    expect(checkNewPeriod(BODY, NOW, DEFAULT_BUFFER_DAYS)).toEqual({
      contractType: 'regular',
      contractStart: day('2026-12-01'),
      contractEnd: day('2027-01-31'),
      interval: 14,
      quota: 2,
      fixedRate: 1_500_000,
      deadlines: [day('2026-12-06'), day('2026-12-20')],
    });
  });

  it('applies the Tambah Creator rules, under the same field names', () => {
    expect(
      errorsOf(() =>
        checkNewPeriod(
          {
            contractType: 'freelance',
            contractStart: '2026-11-17',
            contractEnd: '2027-01-31',
            interval: 0,
            quota: 101,
            fixedRate: '1500000',
            deadlines: ['2026-12-06'],
          },
          NOW,
          DEFAULT_BUFFER_DAYS,
        ),
      ),
    ).toEqual({
      contractType: 'Jenis kontrak harus probation atau regular',
      contractStart: 'Tanggal mulai tidak boleh sebelum hari ini',
      interval: 'Jarak antar-deadline minimal 1 hari',
      quota: 'Jumlah konten maksimal 100',
      fixedRate: 'Fixed rate wajib diisi',
    });
  });

  it('refuses deadlines that do not match the quota or the buffer', () => {
    expect(
      errorsOf(() =>
        checkNewPeriod(
          { ...BODY, deadlines: ['2026-12-05', '2026-12-20'] },
          NOW,
          DEFAULT_BUFFER_DAYS,
        ),
      ),
    ).toEqual({ deadlines: 'Deadline paling cepat 6 Des 2026' });
    expect(
      errorsOf(() =>
        checkNewPeriod(
          { ...BODY, deadlines: ['2026-12-06'] },
          NOW,
          DEFAULT_BUFFER_DAYS,
        ),
      ),
    ).toEqual({
      deadlines: 'Jumlah deadline harus sama dengan jumlah konten (2)',
    });
  });

  it('answers a missing body with the blank-form errors, not a TypeError', () => {
    expect(
      Object.keys(
        errorsOf(() => checkNewPeriod(null, NOW, DEFAULT_BUFFER_DAYS)),
      ),
    ).toEqual([
      'contractType',
      'contractStart',
      'contractEnd',
      'interval',
      'quota',
      'fixedRate',
      'deadlines',
    ]);
  });

  it('never reads creator fields: a name or email in the body changes nothing', () => {
    expect(
      checkNewPeriod(
        { ...BODY, name: '', email: 'not an email' },
        NOW,
        DEFAULT_BUFFER_DAYS,
      ),
    ).toEqual(checkNewPeriod(BODY, NOW, DEFAULT_BUFFER_DAYS));
  });
});

describe('periodHasStarted', () => {
  it('counts a period as started from its first day in Jakarta', () => {
    expect(periodHasStarted(day('2026-11-19'), NOW)).toBe(false);
    expect(periodHasStarted(day('2026-11-18'), NOW)).toBe(true);
    expect(periodHasStarted(day('2026-11-01'), NOW)).toBe(true);
  });

  it('turns at midnight WIB, while UTC is still on the day before', () => {
    // 00:30 WIB on 19 November is 17:30 UTC on the 18th.
    expect(
      periodHasStarted(day('2026-11-19'), new Date('2026-11-18T17:30:00Z')),
    ).toBe(true);
    expect(
      periodHasStarted(day('2026-11-19'), new Date('2026-11-18T16:59:00Z')),
    ).toBe(false);
  });
});

describe('overlappingPeriod', () => {
  const terms = {
    contractStart: day('2026-12-01'),
    contractEnd: day('2027-01-31'),
  };

  it('accepts a period starting the day after the last one ends', () => {
    expect(
      overlappingPeriod(terms, [
        { startDate: day('2026-06-01'), endDate: day('2026-11-30') },
      ]),
    ).toBeUndefined();
  });

  it('accepts a period ending the day before a later one starts', () => {
    expect(
      overlappingPeriod(terms, [
        { startDate: day('2027-02-01'), endDate: day('2027-03-31') },
      ]),
    ).toBeUndefined();
  });

  it('refuses a start on the last day of another period: both days count', () => {
    expect(
      overlappingPeriod(terms, [
        { startDate: day('2026-06-01'), endDate: day('2026-12-01') },
      ]),
    ).toBe('Periode bertabrakan dengan kontrak 1 Jun 2026 – 1 Des 2026');
  });

  it('refuses an end on the first day of a later period', () => {
    expect(
      overlappingPeriod(terms, [
        { startDate: day('2027-01-31'), endDate: day('2027-03-31') },
      ]),
    ).toBe('Periode bertabrakan dengan kontrak 31 Jan 2027 – 31 Mar 2027');
  });

  it('refuses a period inside or around another one', () => {
    expect(
      overlappingPeriod(terms, [
        { startDate: day('2026-12-10'), endDate: day('2026-12-20') },
      ]),
    ).toBe('Periode bertabrakan dengan kontrak 10 Des 2026 – 20 Des 2026');
    expect(
      overlappingPeriod(terms, [
        { startDate: day('2026-11-01'), endDate: day('2027-02-28') },
      ]),
    ).toBe('Periode bertabrakan dengan kontrak 1 Nov 2026 – 28 Feb 2027');
  });

  it('names the earliest clash when there are several, and passes with none', () => {
    expect(
      overlappingPeriod(terms, [
        { startDate: day('2027-01-15'), endDate: day('2027-03-31') },
        { startDate: day('2026-11-15'), endDate: day('2026-12-05') },
      ]),
    ).toBe('Periode bertabrakan dengan kontrak 15 Nov 2026 – 5 Des 2026');
    expect(overlappingPeriod(terms, [])).toBeUndefined();
  });
});

describe('specificOutsidePeriod', () => {
  const terms = {
    contractStart: day('2026-12-01'),
    contractEnd: day('2027-01-31'),
  };

  it('passes Specific content inside the new window, edges included', () => {
    expect(
      specificOutsidePeriod(
        terms,
        [
          { name: 'Launch', deadline: day('2026-12-06') },
          { name: 'Promo', deadline: day('2027-01-26') },
        ],
        NOW,
        DEFAULT_BUFFER_DAYS,
      ),
    ).toBeUndefined();
  });

  it('names content due before start + buffer', () => {
    expect(
      specificOutsidePeriod(
        terms,
        [{ name: 'Launch', deadline: day('2026-12-05') }],
        NOW,
        DEFAULT_BUFFER_DAYS,
      ),
    ).toBe(
      'Konten "Launch" (deadline 5 Des 2026) di luar periode baru (6 Des 2026 – 26 Jan 2027); pindahkan atau hapus dulu',
    );
  });

  it('names content due after the H-5 line', () => {
    expect(
      specificOutsidePeriod(
        terms,
        [{ name: 'Promo', deadline: day('2027-01-27') }],
        NOW,
        DEFAULT_BUFFER_DAYS,
      ),
    ).toBe(
      'Konten "Promo" (deadline 27 Jan 2027) di luar periode baru (6 Des 2026 – 26 Jan 2027); pindahkan atau hapus dulu',
    );
  });

  it('passes a period with no Specific content', () => {
    expect(
      specificOutsidePeriod(terms, [], NOW, DEFAULT_BUFFER_DAYS),
    ).toBeUndefined();
  });
});

// PBI-23 AC 22 (SCRUM-298): Perpanjang Kontrak and its edit take the stored buffer for both lines.
describe('periods with the stored buffer', () => {
  it('checks a new period by the stored buffer', () => {
    expect(
      errorsOf(() =>
        checkNewPeriod(
          { ...BODY, deadlines: ['2026-12-20', '2026-12-09'] },
          NOW,
          9,
        ),
      ),
    ).toEqual({ deadlines: 'Deadline paling cepat 10 Des 2026' });
  });

  it('keeps Specific content inside the window the stored buffer draws', () => {
    const terms = {
      contractStart: day('2026-12-01'),
      contractEnd: day('2027-01-31'),
    };

    expect(
      specificOutsidePeriod(
        terms,
        [{ name: 'Promo', deadline: day('2027-01-23') }],
        NOW,
        9,
      ),
    ).toBe(
      'Konten "Promo" (deadline 23 Jan 2027) di luar periode baru (10 Des 2026 – 22 Jan 2027); pindahkan atau hapus dulu',
    );
  });
});

describe('waitingPeriod', () => {
  it('names a period that has not started, so a renewal waits until it is changed or deleted', () => {
    expect(
      waitingPeriod(
        [
          { startDate: day('2026-06-01'), endDate: day('2026-11-30') },
          { startDate: day('2026-12-01'), endDate: day('2027-01-31') },
        ],
        NOW,
      ),
    ).toBe(
      'Periode 1 Des 2026 – 31 Jan 2027 belum dimulai. Ubah atau hapus periode itu dulu sebelum menambah periode baru',
    );
  });

  it('names the earliest of several periods that have not started, whatever order they come in', () => {
    expect(
      waitingPeriod(
        [
          { startDate: day('2027-03-01'), endDate: day('2027-05-31') },
          { startDate: day('2026-12-01'), endDate: day('2027-01-31') },
        ],
        NOW,
      ),
    ).toBe(
      'Periode 1 Des 2026 – 31 Jan 2027 belum dimulai. Ubah atau hapus periode itu dulu sebelum menambah periode baru',
    );
  });

  it('passes when every period has started, the one starting today included', () => {
    expect(
      waitingPeriod(
        [
          { startDate: day('2026-06-01'), endDate: day('2026-11-17') },
          { startDate: day('2026-11-18'), endDate: day('2027-01-31') },
        ],
        NOW,
      ),
    ).toBeUndefined();
    expect(waitingPeriod([], NOW)).toBeUndefined();
  });
});
