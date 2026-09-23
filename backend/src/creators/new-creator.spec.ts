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
    contractStart: '2026-10-01',
    contractEnd: '2026-12-31',
    interval: 7,
    quota: 3,
    fixedRate: 500000,
    deadlines: ['2026-10-06', '2026-10-13', '2026-10-20'],
    ...overrides,
  };
}

/** The per-field messages a rejected body comes back with. */
function errorsFor(input: unknown): Record<string, string> {
  try {
    checkNewCreator(input, TODAY);
  } catch (error) {
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    return (
      (error as UnprocessableEntityException).getResponse() as {
        errors: Record<string, string>;
      }
    ).errors;
  }
  throw new Error('expected the body to be rejected');
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
});
