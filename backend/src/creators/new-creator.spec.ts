import { UnprocessableEntityException } from '@nestjs/common';
import { checkNewCreator } from './new-creator.js';

const TODAY = new Date('2026-09-23T00:00:00Z');

/** A calendar day as Postgres `date` columns hold it: midnight UTC. */
function day(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** A body the Add Creator modal could send, valid on TODAY; each test breaks one thing. */
function body(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    name: 'Salsa Putri Amelia',
    email: 'salsa@example.com',
    socialPlatform: 'instagram',
    socialUsername: 'salsa.amelia',
    contractType: 'probation',
    contractStart: '2026-10-01',
    contractEnd: '2026-12-31',
    interval: 7,
    quota: 3,
    fixedRate: 500000,
    deadlines: ['2026-10-06', '2026-10-13', '2026-10-20'],
    ...overrides,
  };
}

/** The per-field messages a body is rejected with; empty when the body is accepted. */
function fieldErrors(input: unknown): Record<string, string> {
  try {
    checkNewCreator(input, TODAY);
    return {};
  } catch (error) {
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    return (
      (error as UnprocessableEntityException).getResponse() as {
        errors: Record<string, string>;
      }
    ).errors;
  }
}

/** Like fieldErrors, for a body that must be rejected. */
function errorsFor(input: unknown): Record<string, string> {
  const errors = fieldErrors(input);
  expect(errors).not.toEqual({});
  return errors;
}

describe('checkNewCreator', () => {
  it('turns a valid body into the creator to save', () => {
    expect(checkNewCreator(body(), TODAY)).toEqual({
      firstName: 'Salsa',
      middleName: 'Putri',
      lastName: 'Amelia',
      email: 'salsa@example.com',
      socialPlatform: 'instagram',
      socialUsername: 'salsa.amelia',
      contractType: 'probation',
      contractStart: day('2026-10-01'),
      contractEnd: day('2026-12-31'),
      interval: 7,
      quota: 3,
      fixedRate: 500000,
      deadlines: [day('2026-10-06'), day('2026-10-13'), day('2026-10-20')],
    });
  });

  describe('name', () => {
    it.each([
      ['a single word', 'Salsa', ['Salsa', null, null]],
      ['two words', 'Salsa Amelia', ['Salsa', null, 'Amelia']],
      ['three words', 'Salsa Putri Amelia', ['Salsa', 'Putri', 'Amelia']],
      [
        'four words',
        'Salsa Putri Dewi Amelia',
        ['Salsa', 'Putri Dewi', 'Amelia'],
      ],
      [
        'padded, doubled spaces',
        '  Salsa   Amelia ',
        ['Salsa', null, 'Amelia'],
      ],
    ])(
      'splits %s into first/middle/last',
      (_case, name, [first, middle, last]) => {
        expect(checkNewCreator(body({ name }), TODAY)).toMatchObject({
          firstName: first,
          middleName: middle,
          lastName: last,
        });
      },
    );

    it.each([
      ['missing', undefined],
      ['empty', ''],
      ['only spaces', '   '],
      ['not a string', 42],
    ])('is required (%s)', (_case, name) => {
      expect(errorsFor(body({ name }))).toEqual({ name: 'Nama wajib diisi' });
    });

    it('accepts 100 characters and rejects 101', () => {
      expect(() =>
        checkNewCreator(body({ name: 'a'.repeat(100) }), TODAY),
      ).not.toThrow();
      expect(errorsFor(body({ name: 'a'.repeat(101) }))).toEqual({
        name: 'Nama maksimal 100 karakter',
      });
    });
  });

  // One case per rule in PRD §3.4 (Email → format check), plus the RFC 5321 length limit.
  describe('email', () => {
    it.each([
      ['a plain address', 'salsa@example.com', 'salsa@example.com'],
      [
        'dots, plus and subdomains',
        'salsa.amelia+ugc@mail.example.co.id',
        'salsa.amelia+ugc@mail.example.co.id',
      ],
      ['surrounding spaces', '  salsa@example.com ', 'salsa@example.com'],
    ])('accepts %s', (_case, email, saved) => {
      expect(checkNewCreator(body({ email }), TODAY).email).toBe(saved);
    });

    it.each([
      ['missing', undefined],
      ['empty', ''],
      ['not a string', 42],
    ])('is required (%s)', (_case, email) => {
      expect(errorsFor(body({ email }))).toEqual({
        email: 'Email wajib diisi',
      });
    });

    it.each([
      ['no "@"', 'salsa.example.com'],
      ['two "@"', 'sal@sa@example.com'],
      ['an empty local part', '@example.com'],
      ['no domain', 'salsa@'],
      ['a domain without a dot', 'salsa@gmail'],
      ['a space inside', 'sal sa@example.com'],
      ['a disallowed character', 'sal<sa>@example.com'],
      ['a leading dot', '.salsa@example.com'],
      ['a trailing dot', 'salsa@example.com.'],
      ['a dot right before "@"', 'salsa.@example.com'],
      ['a dot right after "@"', 'salsa@.example.com'],
      ['two dots in the local part', 'salsa..amelia@example.com'],
      ['two dots in the domain', 'salsa@example..com'],
    ])('rejects %s', (_case, email) => {
      expect(errorsFor(body({ email }))).toEqual({
        email: 'Format email tidak valid',
      });
    });

    it('accepts 254 characters and rejects 255', () => {
      const at = (length: number) =>
        `${'a'.repeat(length - '@example.com'.length)}@example.com`;

      expect(checkNewCreator(body({ email: at(254) }), TODAY).email).toBe(
        at(254),
      );
      expect(errorsFor(body({ email: at(255) }))).toEqual({
        email: 'Format email tidak valid',
      });
    });
  });

  describe('contract type', () => {
    it.each(['probation', 'regular'])('accepts a %s contract', (contractType) => {
      expect(checkNewCreator(body({ contractType }), TODAY)).toMatchObject({
        contractType,
      });
    });

    it.each([
      ['missing', undefined],
      ['empty', ''],
    ])('requires a contract type (%s)', (_case, contractType) => {
      expect(errorsFor(body({ contractType }))).toEqual({
        contractType: 'Jenis kontrak wajib dipilih',
      });
    });

    it.each([
      ['a type the database has no enum for', 'freelance'],
      ['a differently cased value', 'Probation'],
      ['not a string', 1],
    ])('rejects %s', (_case, contractType) => {
      expect(errorsFor(body({ contractType }))).toEqual({
        contractType: 'Jenis kontrak harus probation atau regular',
      });
    });
  });

  describe('social account', () => {
    it.each(['instagram', 'tiktok'])('accepts the %s platform', (platform) => {
      expect(
        checkNewCreator(body({ socialPlatform: platform }), TODAY),
      ).toMatchObject({ socialPlatform: platform });
    });

    it.each([
      ['missing', undefined],
      ['empty', ''],
    ])('requires a platform (%s)', (_case, socialPlatform) => {
      expect(errorsFor(body({ socialPlatform }))).toEqual({
        socialPlatform: 'Platform wajib dipilih',
      });
    });

    it.each([
      ['a platform the database has no enum for', 'youtube'],
      ['a differently cased value', 'Instagram'],
      ['not a string', 1],
    ])('rejects %s', (_case, socialPlatform) => {
      expect(errorsFor(body({ socialPlatform }))).toEqual({
        socialPlatform: 'Platform harus instagram atau tiktok',
      });
    });

    it('trims the username', () => {
      expect(
        checkNewCreator(body({ socialUsername: ' salsa.amelia ' }), TODAY)
          .socialUsername,
      ).toBe('salsa.amelia');
    });

    it.each([
      ['missing', undefined],
      ['empty', ''],
      ['only spaces', '  '],
      ['not a string', 7],
    ])('requires a username (%s)', (_case, socialUsername) => {
      expect(errorsFor(body({ socialUsername }))).toEqual({
        socialUsername: 'Username wajib diisi',
      });
    });

    it('accepts a 100-character username and rejects 101', () => {
      expect(() =>
        checkNewCreator(body({ socialUsername: 'u'.repeat(100) }), TODAY),
      ).not.toThrow();
      expect(errorsFor(body({ socialUsername: 'u'.repeat(101) }))).toEqual({
        socialUsername: 'Username maksimal 100 karakter',
      });
    });
  });

  describe('contract dates', () => {
    it('accepts a contract starting today', () => {
      expect(
        checkNewCreator(body({ contractStart: '2026-09-23' }), TODAY)
          .contractStart,
      ).toEqual(day('2026-09-23'));
    });

    // "Today" is the UTC calendar day, the same one the modal's date check uses; the time of
    // day the request arrives must not turn today's date into "before today".
    it('still accepts today late in the UTC day', () => {
      const lateToday = new Date('2026-09-23T23:59:59Z');

      expect(() =>
        checkNewCreator(body({ contractStart: '2026-09-23' }), lateToday),
      ).not.toThrow();
    });

    it('rejects a start before today', () => {
      expect(errorsFor(body({ contractStart: '2026-09-22' }))).toMatchObject({
        contractStart: 'Tanggal mulai tidak boleh sebelum hari ini',
      });
    });

    it('rejects a start after the end', () => {
      expect(
        errorsFor(
          body({ contractStart: '2027-01-01', contractEnd: '2026-12-31' }),
        ),
      ).toMatchObject({
        contractStart: 'Tanggal mulai tidak boleh setelah tanggal berakhir',
      });
    });

    it('allows a contract that starts and ends on the same day', () => {
      const errors = fieldErrors(
        body({ contractStart: '2026-10-01', contractEnd: '2026-10-01' }),
      );

      expect(errors).not.toHaveProperty('contractStart');
      expect(errors).not.toHaveProperty('contractEnd');
    });

    it('rejects an end before today', () => {
      expect(errorsFor(body({ contractEnd: '2026-09-22' }))).toMatchObject({
        contractEnd: 'Tanggal berakhir tidak boleh sebelum hari ini',
      });
    });

    it.each([
      ['contractStart', 'Tanggal mulai wajib diisi'],
      ['contractEnd', 'Tanggal berakhir wajib diisi'],
    ])('requires %s, and reports nothing else', (field, message) => {
      // Exact match: a missing end must not also read as "start after end".
      expect(errorsFor(body({ [field]: undefined }))).toEqual({
        [field]: message,
      });
      expect(errorsFor(body({ [field]: '' }))).toEqual({ [field]: message });
    });

    it.each([
      ['day-month-year order', '01-10-2026'],
      ['a month that does not exist', '2026-13-01'],
      ['a day the month does not have', '2026-02-30'],
      ['a timestamp instead of a day', '2026-10-01T00:00:00Z'],
      // Date parses both of these as 1 January / 1 October; only a full day is a day.
      ['a year only', '2026'],
      ['a year and month only', '2026-10'],
      ['a number', 20261001],
    ])('rejects %s', (_case, value) => {
      expect(errorsFor(body({ contractStart: value }))).toMatchObject({
        contractStart: 'Tanggal mulai tidak valid',
      });
      expect(errorsFor(body({ contractEnd: value }))).toMatchObject({
        contractEnd: 'Tanggal berakhir tidak valid',
      });
    });
  });

  describe('numbers', () => {
    // Each numeric field with the messages the modal already uses for its own checks.
    const fields = [
      {
        field: 'interval',
        required: 'Jarak antar-deadline wajib diisi',
        tooSmall: 'Jarak antar-deadline minimal 1 hari',
      },
      {
        field: 'quota',
        required: 'Jumlah konten wajib diisi',
        tooSmall: 'Jumlah konten harus lebih dari 0',
      },
      {
        field: 'fixedRate',
        required: 'Fixed rate wajib diisi',
        tooSmall: 'Fixed rate harus lebih dari 0',
      },
    ];

    describe.each(fields)('$field', ({ field, required, tooSmall }) => {
      it.each([
        ['missing', undefined],
        ['null', null],
        ['a numeric string', '7'],
        ['a boolean', true],
        // JSON cannot carry these, but the checker should not rely on its caller being JSON.
        ['NaN', Number.NaN],
        ['Infinity', Number.POSITIVE_INFINITY],
      ])('is required as a finite number (%s)', (_case, value) => {
        expect(errorsFor(body({ [field]: value }))).toMatchObject({
          [field]: required,
        });
      });

      it.each([
        ['zero', 0],
        ['negative', -1],
      ])('rejects %s', (_case, value) => {
        expect(errorsFor(body({ [field]: value }))).toMatchObject({
          [field]: tooSmall,
        });
      });
    });

    it.each(['interval', 'quota'])('%s must be a whole number', (field) => {
      expect(errorsFor(body({ [field]: 1.5 }))).toMatchObject({
        [field]: expect.stringContaining('bilangan bulat'),
      });
    });

    // Postgres `integer` stops at 2^31 - 1; anything above would fail inside the insert.
    it.each(['interval', 'quota'])(
      '%s is capped at the largest Postgres integer',
      (field) => {
        expect(errorsFor(body({ [field]: 2 ** 31 }))).toMatchObject({
          [field]: expect.stringContaining('terlalu besar'),
        });
      },
    );

    it('accepts an interval of 1 day, the PRD minimum', () => {
      expect(checkNewCreator(body({ interval: 1 }), TODAY).interval).toBe(1);
    });

    it('accepts a fixed rate with cents', () => {
      expect(
        checkNewCreator(body({ fixedRate: 750000.5 }), TODAY).fixedRate,
      ).toBe(750000.5);
    });

    it('rejects a fixed rate with more than two decimals', () => {
      expect(errorsFor(body({ fixedRate: 0.001 }))).toEqual({
        fixedRate: 'Fixed rate maksimal 2 angka desimal',
      });
    });

    // contracts.fixed_rate is numeric(14, 2): twelve digits before the decimal point.
    it('accepts the largest numeric(14, 2) and rejects one more', () => {
      expect(
        checkNewCreator(body({ fixedRate: 999_999_999_999.99 }), TODAY)
          .fixedRate,
      ).toBe(999_999_999_999.99);
      expect(errorsFor(body({ fixedRate: 1_000_000_000_000 }))).toEqual({
        fixedRate: 'Fixed rate terlalu besar',
      });
    });
  });

  // PRD 3.4 (Simpan only once exactly the quota is allocated) and 3.6 (every new deadline on
  // or after max(today, contract start) + buffer). The body's contract starts 2026-10-01, so
  // with the default 5-day buffer the earliest slot is 2026-10-06; it ends 2026-12-31.
  describe('deadlines', () => {
    const three = (...dates: string[]) => ({ quota: 3, deadlines: dates });

    it.each([
      ['missing', undefined],
      ['not a list', '2026-10-06'],
    ])('are required (%s)', (_case, deadlines) => {
      expect(errorsFor(body({ deadlines }))).toEqual({
        deadlines: 'Jadwal deadline wajib diisi',
      });
    });

    it.each([
      ['fewer than the quota', ['2026-10-06', '2026-10-13']],
      [
        'more than the quota',
        ['2026-10-06', '2026-10-13', '2026-10-20', '2026-10-27'],
      ],
    ])('must match the quota exactly (%s)', (_case, deadlines) => {
      expect(errorsFor(body({ quota: 3, deadlines }))).toEqual({
        deadlines: 'Jumlah deadline harus sama dengan jumlah konten (3)',
      });
    });

    it('rejects a deadline that is not a calendar day', () => {
      expect(
        errorsFor(body(three('2026-10-06', '2026-02-30', '2026-10-20'))),
      ).toEqual({ deadlines: 'Deadline tidak valid' });
    });

    it('accepts the first day after the buffer and rejects the day before it', () => {
      expect(() =>
        checkNewCreator(
          body(three('2026-10-06', '2026-10-13', '2026-10-20')),
          TODAY,
        ),
      ).not.toThrow();
      expect(
        errorsFor(body(three('2026-10-05', '2026-10-13', '2026-10-20'))),
      ).toEqual({ deadlines: 'Deadline paling cepat 2026-10-06' });
    });

    it('measures the buffer from today when the contract starts today', () => {
      const startsToday = { contractStart: '2026-09-23' };

      expect(() =>
        checkNewCreator(
          body({
            ...startsToday,
            ...three('2026-09-28', '2026-10-05', '2026-10-12'),
          }),
          TODAY,
        ),
      ).not.toThrow();
      expect(
        errorsFor(
          body({
            ...startsToday,
            ...three('2026-09-27', '2026-10-05', '2026-10-12'),
          }),
        ),
      ).toEqual({ deadlines: 'Deadline paling cepat 2026-09-28' });
    });

    it('accepts the contract end date and rejects the day after it', () => {
      expect(() =>
        checkNewCreator(
          body(three('2026-10-06', '2026-10-13', '2026-12-31')),
          TODAY,
        ),
      ).not.toThrow();
      expect(
        errorsFor(body(three('2026-10-06', '2026-10-13', '2027-01-01'))),
      ).toEqual({ deadlines: 'Deadline tidak boleh setelah akhir kontrak' });
    });

    it('allows more than one slot on the same day, as the PRD does', () => {
      expect(
        checkNewCreator(
          body(three('2026-10-06', '2026-10-06', '2026-10-13')),
          TODAY,
        ).deadlines,
      ).toEqual([day('2026-10-06'), day('2026-10-06'), day('2026-10-13')]);
    });

    // Evergreen titles are numbered in deadline order, so the service needs them sorted.
    it('returns the deadlines in date order', () => {
      expect(
        checkNewCreator(
          body(three('2026-10-20', '2026-10-06', '2026-10-13')),
          TODAY,
        ).deadlines,
      ).toEqual([day('2026-10-06'), day('2026-10-13'), day('2026-10-20')]);
    });

    // With no usable contract period or quota there is nothing to check the slots against;
    // the admin fixes that field first rather than reading a second, derived error.
    it.each([
      ['the quota is invalid', { quota: 0 }],
      ['the start date is invalid', { contractStart: 'soon' }],
      ['the end date is invalid', { contractEnd: '' }],
    ])('are not judged when %s', (_case, overrides) => {
      expect(errorsFor(body(overrides))).not.toHaveProperty('deadlines');
    });
  });

  describe('body shape', () => {
    it.each([
      ['null', null],
      ['a list', []],
      ['a string', 'salsa@example.com'],
      ['nothing', undefined],
    ])(
      'answers a %s body with a 422 listing every required field',
      (_case, input) => {
        expect(Object.keys(errorsFor(input)).sort()).toEqual([
          'contractEnd',
          'contractStart',
          'contractType',
          'deadlines',
          'email',
          'fixedRate',
          'interval',
          'name',
          'quota',
          'socialPlatform',
          'socialUsername',
        ]);
      },
    );

    it('rejects with a 422 carrying a summary message and the field errors', () => {
      expect(() => checkNewCreator(body({ name: '' }), TODAY)).toThrow(
        expect.objectContaining({
          status: 422,
          response: {
            message: 'Data creator tidak valid',
            errors: { name: 'Nama wajib diisi' },
          },
        }),
      );
    });

    it('reports every invalid field at once, not just the first', () => {
      expect(errorsFor(body({ name: '', email: 'salsa', quota: 0 }))).toEqual({
        name: 'Nama wajib diisi',
        email: 'Format email tidak valid',
        quota: 'Jumlah konten harus lebih dari 0',
      });
    });

    // Mass assignment: whatever else a client sends must not reach the insert, above all
    // users.is_admin, which would turn a creator's login into an admin one.
    it('drops fields it does not know, such as is_admin', () => {
      const creator = checkNewCreator(
        body({ is_admin: true, isAdmin: true, user_id: 'someone-else' }),
        TODAY,
      );

      expect(creator).not.toHaveProperty('is_admin');
      expect(creator).not.toHaveProperty('isAdmin');
      expect(creator).not.toHaveProperty('user_id');
    });
  });
});
