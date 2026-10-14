import { UnprocessableEntityException } from '@nestjs/common';
import {
  checkRateFormula,
  MAX_MONEY,
  MAX_TIERS_PER_PLATFORM,
} from './rate-formula.js';

// Input space of the Atur Formula Rate body, partitioned per field:
//   amount (specificBonus, latePenaltyPerDay, tier threshold, tier bonus):
//     not a number | negative | zero | cents | > 2 decimals | ≤ 10 integer digits | > 10 digits
//   tiers per platform: not a list | 0 | 1..5 | 6+
//   threshold order: strictly increasing | equal | decreasing
//   platform keys: every known one | missing one | unknown one
//   body: object | null, array, string, number
// Each block below takes one partition and its boundary values.

const VALID = {
  specificBonus: 250000,
  latePenaltyPerDay: 50000,
  performanceBonusTiers: {
    instagram: [
      { threshold: 10000, bonus: 100000 },
      { threshold: 50000, bonus: 300000 },
    ],
    tiktok: [{ threshold: 20000, bonus: 150000 }],
  },
};

/** VALID with one top-level field replaced. */
function withField(field: string, value: unknown): Record<string, unknown> {
  return { ...VALID, [field]: value };
}

/** VALID with one platform's tiers replaced. */
function withTiers(platform: string, tiers: unknown): Record<string, unknown> {
  return {
    ...VALID,
    performanceBonusTiers: { ...VALID.performanceBonusTiers, [platform]: tiers },
  };
}

/** `count` valid tiers, thresholds 1000, 2000, … */
function tiers(count: number): { threshold: number; bonus: number }[] {
  return Array.from({ length: count }, (_, index) => ({
    threshold: (index + 1) * 1000,
    bonus: 10000,
  }));
}

/** The per-field errors of a body that must be rejected. */
function errorsFor(input: unknown): Record<string, string> {
  let error: unknown;
  try {
    checkRateFormula(input);
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(UnprocessableEntityException);
  const response = (error as UnprocessableEntityException).getResponse() as {
    message: string;
    errors: Record<string, string>;
  };
  expect(response.message).toBe('Formula rate tidak valid');
  return response.errors;
}

describe('checkRateFormula', () => {
  describe('a valid formula', () => {
    it('returns the formula as given', () => {
      expect(checkRateFormula(VALID)).toEqual(VALID);
    });

    it('accepts zero for every amount, as a formula with no bonus or penalty', () => {
      const zero = {
        specificBonus: 0,
        latePenaltyPerDay: 0,
        performanceBonusTiers: {
          instagram: [{ threshold: 0, bonus: 0 }],
          tiktok: [],
        },
      };

      expect(checkRateFormula(zero)).toEqual(zero);
    });

    it('accepts amounts in cents', () => {
      const cents = {
        ...withField('specificBonus', 0.01),
        latePenaltyPerDay: 12500.5,
      };

      expect(checkRateFormula(cents)).toMatchObject({
        specificBonus: 0.01,
        latePenaltyPerDay: 12500.5,
      });
    });

    it('accepts the largest amount ten integer digits and two decimals can hold', () => {
      expect(MAX_MONEY).toBe(9_999_999_999.99);

      const largest = {
        specificBonus: MAX_MONEY,
        latePenaltyPerDay: 9_999_999_999,
        performanceBonusTiers: {
          instagram: [{ threshold: MAX_MONEY, bonus: MAX_MONEY }],
          tiktok: [],
        },
      };

      expect(checkRateFormula(largest)).toEqual(largest);
    });

    it('does not require bonuses to rise with the threshold', () => {
      const falling = withTiers('instagram', [
        { threshold: 100, bonus: 500000 },
        { threshold: 200, bonus: 100000 },
      ]);

      expect(checkRateFormula(falling)).toEqual(falling);
    });
  });

  describe('fields the formula does not have', () => {
    it('drops unknown top-level fields, including a content fee and audit columns', () => {
      const result = checkRateFormula({
        ...VALID,
        contentFee: 75000,
        id: false,
        updatedBy: '00000000-0000-4000-8000-000000000000',
        configured: false,
      });

      expect(result).toEqual(VALID);
      expect(Object.keys(result).sort()).toEqual([
        'latePenaltyPerDay',
        'performanceBonusTiers',
        'specificBonus',
      ]);
    });

    it('keeps only threshold and bonus from each tier', () => {
      const result = checkRateFormula(
        withTiers('tiktok', [
          { threshold: 20000, bonus: 150000, position: 9, platform: 'instagram' },
        ]),
      );

      expect(result.performanceBonusTiers.tiktok).toEqual([
        { threshold: 20000, bonus: 150000 },
      ]);
    });

    it('rejects a platform the database does not know', () => {
      expect(
        errorsFor(withTiers('youtube', [{ threshold: 1, bonus: 1 }])),
      ).toEqual({
        'performanceBonusTiers.youtube': 'Platform harus instagram atau tiktok',
      });
    });

    it('rejects a __proto__ platform key without touching Object.prototype', () => {
      const body: unknown = JSON.parse(
        '{"specificBonus":1,"latePenaltyPerDay":1,"performanceBonusTiers":' +
          '{"instagram":[],"tiktok":[],"__proto__":[{"threshold":1,"bonus":1}]}}',
      );

      expect(errorsFor(body)).toEqual({
        'performanceBonusTiers.__proto__': 'Platform harus instagram atau tiktok',
      });
      expect(Object.prototype).not.toHaveProperty('threshold');
      expect(Object.prototype).not.toHaveProperty('0');
    });
  });

  describe.each([
    ['specificBonus', 'Bonus Specific'],
    ['latePenaltyPerDay', 'Penalti per hari'],
  ])('%s', (field, label) => {
    it.each([undefined, null, ''])('is required (%s)', (value) => {
      expect(errorsFor(withField(field, value))).toEqual({
        [field]: `${label} wajib diisi`,
      });
    });

    // A number in a string or a boolean would be coerced by JavaScript, but means the client
    // is sending something other than what the form holds.
    it.each(['250000', true, {}, [], NaN, Infinity])(
      'must be a JSON number (%s)',
      (value) => {
        expect(errorsFor(withField(field, value))).toEqual({
          [field]: `${label} harus berupa angka`,
        });
      },
    );

    it.each([-1, -0.01])('rejects a negative amount (%s)', (value) => {
      expect(errorsFor(withField(field, value))).toEqual({
        [field]: `${label} tidak boleh negatif`,
      });
    });

    it.each([0.001, 1.005, 100.123])(
      'rejects more than two decimals (%s)',
      (value) => {
        expect(errorsFor(withField(field, value))).toEqual({
          [field]: `${label} maksimal 2 angka desimal`,
        });
      },
    );

    it.each([10_000_000_000, 99_999_999_999.99, 1e21])(
      'rejects more than ten integer digits (%s)',
      (value) => {
        expect(errorsFor(withField(field, value))).toEqual({
          [field]: `${label} maksimal 10 digit sebelum koma`,
        });
      },
    );
  });

  describe('performance bonus tiers', () => {
    it.each([undefined, null, [], 'instagram', 5])(
      'must be an object keyed by platform (%s)',
      (value) => {
        expect(errorsFor(withField('performanceBonusTiers', value))).toEqual({
          performanceBonusTiers: 'Tier bonus performa wajib diisi',
        });
      },
    );

    it('needs every platform, so a full replace cannot drop one by omission', () => {
      expect(
        errorsFor(
          withField('performanceBonusTiers', {
            instagram: VALID.performanceBonusTiers.instagram,
          }),
        ),
      ).toEqual({
        'performanceBonusTiers.tiktok': 'Tier bonus tiktok wajib berupa daftar',
      });
    });

    it.each([null, {}, 'tier', 3])(
      "rejects a platform's tiers that are not a list (%s)",
      (value) => {
        expect(errorsFor(withTiers('instagram', value))).toEqual({
          'performanceBonusTiers.instagram':
            'Tier bonus instagram wajib berupa daftar',
        });
      },
    );

    it.each([0, 1, MAX_TIERS_PER_PLATFORM])(
      'accepts %s tier(s) per platform',
      (count) => {
        const body = withTiers('tiktok', tiers(count));

        expect(checkRateFormula(body).performanceBonusTiers.tiktok).toHaveLength(
          count,
        );
      },
    );

    it('rejects a sixth tier', () => {
      expect(MAX_TIERS_PER_PLATFORM).toBe(5);
      expect(
        errorsFor(withTiers('tiktok', tiers(MAX_TIERS_PER_PLATFORM + 1))),
      ).toEqual({
        'performanceBonusTiers.tiktok': 'Maksimal 5 tier per platform',
      });
    });

    it.each([null, 'tier', 7, []])('rejects a tier that is not an object (%s)', (tier) => {
      expect(
        errorsFor(withTiers('instagram', [{ threshold: 1, bonus: 1 }, tier])),
      ).toEqual({
        'performanceBonusTiers.instagram.1': 'Tier tidak valid',
      });
    });

    describe.each([
      ['threshold', 'Threshold'],
      ['bonus', 'Bonus'],
    ])('a tier %s', (field, label) => {
      const key = `performanceBonusTiers.instagram.0.${field}`;
      const tier = (value: unknown) =>
        withTiers('instagram', [{ threshold: 100, bonus: 1000, [field]: value }]);

      it('is required', () => {
        expect(errorsFor(tier(undefined))).toEqual({
          [key]: `${label} wajib diisi`,
        });
      });

      it('must be a JSON number', () => {
        expect(errorsFor(tier('100'))).toEqual({
          [key]: `${label} harus berupa angka`,
        });
      });

      it('rejects a negative value', () => {
        expect(errorsFor(tier(-0.01))).toEqual({
          [key]: `${label} tidak boleh negatif`,
        });
      });

      it('rejects more than two decimals', () => {
        expect(errorsFor(tier(1.001))).toEqual({
          [key]: `${label} maksimal 2 angka desimal`,
        });
      });

      it('rejects more than ten integer digits', () => {
        expect(errorsFor(tier(10_000_000_000))).toEqual({
          [key]: `${label} maksimal 10 digit sebelum koma`,
        });
      });
    });

    describe('threshold order', () => {
      it('accepts strictly increasing thresholds, the smallest step included', () => {
        const body = withTiers('instagram', [
          { threshold: 0, bonus: 1 },
          { threshold: 0.01, bonus: 1 },
          { threshold: 1, bonus: 1 },
        ]);

        expect(checkRateFormula(body)).toEqual(body);
      });

      it('rejects a threshold equal to the one before it', () => {
        expect(
          errorsFor(
            withTiers('instagram', [
              { threshold: 100, bonus: 1 },
              { threshold: 100, bonus: 2 },
            ]),
          ),
        ).toEqual({
          'performanceBonusTiers.instagram.1.threshold':
            'Threshold harus lebih besar dari tier sebelumnya',
        });
      });

      it('rejects a threshold below the one before it, also further down the list', () => {
        expect(
          errorsFor(
            withTiers('tiktok', [
              { threshold: 100, bonus: 1 },
              { threshold: 200, bonus: 1 },
              { threshold: 150, bonus: 1 },
            ]),
          ),
        ).toEqual({
          'performanceBonusTiers.tiktok.2.threshold':
            'Threshold harus lebih besar dari tier sebelumnya',
        });
      });

      it('does not restate an invalid threshold as an ordering error', () => {
        expect(
          errorsFor(
            withTiers('instagram', [
              { threshold: 100, bonus: 1 },
              { threshold: -5, bonus: 1 },
            ]),
          ),
        ).toEqual({
          'performanceBonusTiers.instagram.1.threshold':
            'Threshold tidak boleh negatif',
        });
      });
    });
  });

  describe('a body that is not an object', () => {
    it.each([undefined, null, [], 'formula', 42])(
      'answers every field instead of throwing a TypeError (%s)',
      (body) => {
        expect(errorsFor(body)).toEqual({
          specificBonus: 'Bonus Specific wajib diisi',
          latePenaltyPerDay: 'Penalti per hari wajib diisi',
          performanceBonusTiers: 'Tier bonus performa wajib diisi',
        });
      },
    );
  });

  it('reports every invalid field at once', () => {
    expect(
      errorsFor({
        specificBonus: -1,
        latePenaltyPerDay: '5',
        performanceBonusTiers: {
          instagram: tiers(6),
          tiktok: [{ threshold: 1, bonus: 0.001 }],
        },
      }),
    ).toEqual({
      specificBonus: 'Bonus Specific tidak boleh negatif',
      latePenaltyPerDay: 'Penalti per hari harus berupa angka',
      'performanceBonusTiers.instagram': 'Maksimal 5 tier per platform',
      'performanceBonusTiers.tiktok.0.bonus': 'Bonus maksimal 2 angka desimal',
    });
  });
});
