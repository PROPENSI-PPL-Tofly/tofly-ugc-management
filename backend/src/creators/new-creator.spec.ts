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
});
