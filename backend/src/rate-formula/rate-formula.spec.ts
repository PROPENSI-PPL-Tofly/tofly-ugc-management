import { UnprocessableEntityException } from '@nestjs/common';
import {
  checkRateFormula,
  MAX_LATE_PENALTY_PER_DAY,
  MAX_PENALTY_DAYS,
  MAX_SPECIFIC_BONUS,
  MAX_TIER_AMOUNT,
  PERFORMANCE_METRICS,
} from './rate-formula.js';

// The rules follow the Atur Formula Rate modal of the Tofly Module 1 prototype:
//   Bonus Specific: whole rupiah, Rp0 to Rp10.000.000 (FV.fFormulaSpecific)
//   Penalti per hari: whole rupiah, Rp0 to Rp1.000.000 (FV.fFormulaPenalty)
//   Maks hari penalti: whole days, 0 to 365 (Subtask 8.2's Atur Formula Rate modal)
//   per platform (bonusError): one metric of views/likes/comments/shares, at least one tier,
//     minimum and bonus whole and above 0, neither above 999.999.999, minimums distinct, and the
//     bonus rising with the minimum; saveRateFormula sorts the tiers by minimum, with no tier cap.
// Input space, partitioned per field:
//   amount: missing | not a number | fraction | below range | in range | above range
//   metric: missing | unknown | each known one
//   tiers: not a list | none | not whole numbers | ≤ 0 | > max | duplicate | bonus not rising
//          | unsorted but valid | sorted | many
//   platform keys: every known one | missing one | unknown one
//   body: object | null, array, string, number

const VALID = {
  specificBonus: 100000,
  latePenaltyPerDay: 50000,
  maxPenaltyDays: 3,
  performanceBonus: {
    instagram: {
      metric: 'views',
      tiers: [
        { threshold: 10000, bonus: 150000 },
        { threshold: 40000, bonus: 400000 },
      ],
    },
    tiktok: {
      metric: 'likes',
      tiers: [{ threshold: 5000, bonus: 100000 }],
    },
  },
};

/** VALID with one top-level field replaced. */
function withField(field: string, value: unknown): Record<string, unknown> {
  return { ...VALID, [field]: value };
}

/** VALID with one platform's settings replaced. */
function withPlatform(platform: string, value: unknown): Record<string, unknown> {
  return {
    ...VALID,
    performanceBonus: { ...VALID.performanceBonus, [platform]: value },
  };
}

/** VALID with Instagram's tiers replaced, its metric kept. */
function withTiers(tiers: unknown): Record<string, unknown> {
  return withPlatform('instagram', { metric: 'views', tiers });
}

/** `count` valid tiers, minimums 1000, 2000, … and bonuses rising with them. */
function tiers(count: number): { threshold: number; bonus: number }[] {
  return Array.from({ length: count }, (_, index) => ({
    threshold: (index + 1) * 1000,
    bonus: (index + 1) * 10000,
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

const INSTAGRAM_TIERS = 'performanceBonus.instagram.tiers';

describe('checkRateFormula', () => {
  describe('a valid formula', () => {
    it('returns the formula as given', () => {
      expect(checkRateFormula(VALID)).toEqual(VALID);
    });

    it('offers the metrics the prototype offers', () => {
      expect(PERFORMANCE_METRICS).toEqual(['views', 'likes', 'comments', 'shares']);
    });

    it.each(['views', 'likes', 'comments', 'shares'])(
      'accepts %s as a platform metric',
      (metric) => {
        const body = withPlatform('tiktok', {
          metric,
          tiers: [{ threshold: 1, bonus: 1 }],
        });

        expect(checkRateFormula(body).performanceBonus.tiktok.metric).toBe(metric);
      },
    );

    it('accepts zero for the Specific bonus, the daily penalty and its day cap', () => {
      const zero = {
        ...VALID,
        specificBonus: 0,
        latePenaltyPerDay: 0,
        maxPenaltyDays: 0,
      };

      expect(checkRateFormula(zero)).toEqual(zero);
    });

    it('accepts the largest amounts the prototype allows', () => {
      expect(MAX_SPECIFIC_BONUS).toBe(10_000_000);
      expect(MAX_LATE_PENALTY_PER_DAY).toBe(1_000_000);
      expect(MAX_TIER_AMOUNT).toBe(999_999_999);
      expect(MAX_PENALTY_DAYS).toBe(365);

      const largest = {
        specificBonus: MAX_SPECIFIC_BONUS,
        latePenaltyPerDay: MAX_LATE_PENALTY_PER_DAY,
        maxPenaltyDays: MAX_PENALTY_DAYS,
        performanceBonus: {
          ...VALID.performanceBonus,
          instagram: {
            metric: 'views',
            tiers: [
              { threshold: 1, bonus: 1 },
              { threshold: MAX_TIER_AMOUNT, bonus: MAX_TIER_AMOUNT },
            ],
          },
        },
      };

      expect(checkRateFormula(largest)).toEqual(largest);
    });

    it('sorts the tiers by minimum, as the prototype does on save', () => {
      const result = checkRateFormula(
        withTiers([
          { threshold: 40000, bonus: 400000 },
          { threshold: 10000, bonus: 150000 },
          { threshold: 20000, bonus: 200000 },
        ]),
      );

      expect(result.performanceBonus.instagram.tiers).toEqual([
        { threshold: 10000, bonus: 150000 },
        { threshold: 20000, bonus: 200000 },
        { threshold: 40000, bonus: 400000 },
      ]);
    });

    // The prototype adds tiers with "+ Tambah Tier" and sets no cap.
    it('accepts more than five tiers per platform', () => {
      const many = withTiers(tiers(12));

      expect(checkRateFormula(many).performanceBonus.instagram.tiers).toHaveLength(12);
    });
  });

  describe('fields the formula does not have', () => {
    it('drops unknown top-level fields, including a content fee and audit columns', () => {
      const result = checkRateFormula({
        ...VALID,
        contentFee: 75000,
        maxDays: 10,
        id: false,
        updatedBy: '00000000-0000-4000-8000-000000000000',
        configured: false,
      });

      expect(result).toEqual(VALID);
      expect(Object.keys(result).sort()).toEqual([
        'latePenaltyPerDay',
        'maxPenaltyDays',
        'performanceBonus',
        'specificBonus',
      ]);
    });

    it('keeps only the metric and tiers of a platform, and only minimum and bonus of a tier', () => {
      const result = checkRateFormula(
        withPlatform('tiktok', {
          metric: 'likes',
          platform: 'instagram',
          tiers: [{ threshold: 5000, bonus: 100000, position: 9, platform: 'instagram' }],
        }),
      );

      expect(result.performanceBonus.tiktok).toEqual({
        metric: 'likes',
        tiers: [{ threshold: 5000, bonus: 100000 }],
      });
    });

    it('rejects a platform the database does not know', () => {
      expect(
        errorsFor(withPlatform('youtube', { metric: 'views', tiers: tiers(1) })),
      ).toEqual({
        'performanceBonus.youtube': 'Platform harus instagram atau tiktok',
      });
    });

    it('rejects a __proto__ platform key without touching Object.prototype', () => {
      const body: unknown = JSON.parse(
        '{"specificBonus":1,"latePenaltyPerDay":1,"maxPenaltyDays":1,"performanceBonus":{' +
          '"instagram":{"metric":"views","tiers":[{"threshold":1,"bonus":1}]},' +
          '"tiktok":{"metric":"views","tiers":[{"threshold":1,"bonus":1}]},' +
          '"__proto__":{"metric":"views","tiers":[{"threshold":1,"bonus":1}]}}}',
      );

      expect(errorsFor(body)).toEqual({
        'performanceBonus.__proto__': 'Platform harus instagram atau tiktok',
      });
      expect(Object.prototype).not.toHaveProperty('metric');
      expect(Object.prototype).not.toHaveProperty('tiers');
    });
  });

  describe.each([
    ['specificBonus', 'Bonus Specific', 'Rp10.000.000', MAX_SPECIFIC_BONUS],
    ['latePenaltyPerDay', 'Penalti', 'Rp1.000.000', MAX_LATE_PENALTY_PER_DAY],
  ])('%s', (field, label, max, maxValue) => {
    const range = `${label} harus antara Rp0 dan ${max}`;

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

    it.each([0.5, 1000.01, -0.5])('must be whole rupiah (%s)', (value) => {
      expect(errorsFor(withField(field, value))).toEqual({
        [field]: `${label} harus angka bulat`,
      });
    });

    it.each([-1, -50000])('rejects a negative amount (%s)', (value) => {
      expect(errorsFor(withField(field, value))).toEqual({ [field]: range });
    });

    it('rejects one rupiah past the maximum', () => {
      expect(errorsFor(withField(field, maxValue + 1))).toEqual({
        [field]: range,
      });
    });
  });

  describe('maxPenaltyDays', () => {
    const range = 'Maks hari penalti harus antara 0 hari dan 365 hari';

    it.each([undefined, null, ''])('is required (%s)', (value) => {
      expect(errorsFor(withField('maxPenaltyDays', value))).toEqual({
        maxPenaltyDays: 'Maks hari penalti wajib diisi',
      });
    });

    it.each(['3', true, {}, [], NaN, Infinity])(
      'must be a JSON number (%s)',
      (value) => {
        expect(errorsFor(withField('maxPenaltyDays', value))).toEqual({
          maxPenaltyDays: 'Maks hari penalti harus berupa angka',
        });
      },
    );

    it.each([0.5, 2.25, -0.5])('must be whole days (%s)', (value) => {
      expect(errorsFor(withField('maxPenaltyDays', value))).toEqual({
        maxPenaltyDays: 'Maks hari penalti harus angka bulat',
      });
    });

    it.each([-1, -30])('rejects a negative number of days (%s)', (value) => {
      expect(errorsFor(withField('maxPenaltyDays', value))).toEqual({
        maxPenaltyDays: range,
      });
    });

    it('rejects one day past the maximum', () => {
      expect(
        errorsFor(withField('maxPenaltyDays', MAX_PENALTY_DAYS + 1)),
      ).toEqual({ maxPenaltyDays: range });
    });

    it.each([0, 1, 3, MAX_PENALTY_DAYS])('accepts %s days', (value) => {
      expect(
        checkRateFormula(withField('maxPenaltyDays', value)).maxPenaltyDays,
      ).toBe(value);
    });
  });

  describe('performance bonus', () => {
    it.each([undefined, null, [], 'instagram', 5])(
      'must be an object keyed by platform (%s)',
      (value) => {
        expect(errorsFor(withField('performanceBonus', value))).toEqual({
          performanceBonus: 'Bonus performa wajib diisi',
        });
      },
    );

    it.each([['instagram'], ['tiktok']])(
      'needs %s, so a full replace cannot drop a platform by omission',
      (platform) => {
        const performanceBonus: Record<string, unknown> = {
          ...VALID.performanceBonus,
        };
        delete performanceBonus[platform];

        expect(errorsFor(withField('performanceBonus', performanceBonus))).toEqual({
          [`performanceBonus.${platform}`]: `Bonus performa ${platform} wajib diisi`,
        });
      },
    );

    it.each([null, [], 'views', 3])(
      "rejects a platform's settings that are not an object (%s)",
      (value) => {
        expect(errorsFor(withPlatform('instagram', value))).toEqual({
          'performanceBonus.instagram': 'Bonus performa instagram wajib diisi',
        });
      },
    );

    describe('metric', () => {
      it.each([undefined, null, ''])('is required (%s)', (metric) => {
        expect(
          errorsFor(withPlatform('instagram', { metric, tiers: tiers(1) })),
        ).toEqual({
          'performanceBonus.instagram.metric': 'Metrik wajib dipilih',
        });
      });

      it.each(['impressions', 'Views', 'saves', 7])(
        'must be one the prototype offers (%s)',
        (metric) => {
          expect(
            errorsFor(withPlatform('instagram', { metric, tiers: tiers(1) })),
          ).toEqual({
            'performanceBonus.instagram.metric':
              'Metrik harus views, likes, comments, atau shares',
          });
        },
      );
    });

    describe('tiers', () => {
      it.each([undefined, null, {}, 'tier', 3])('must be a list (%s)', (value) => {
        expect(errorsFor(withTiers(value))).toEqual({
          [INSTAGRAM_TIERS]: 'Tier bonus instagram wajib berupa daftar',
        });
      });

      it('needs at least one tier', () => {
        expect(errorsFor(withTiers([]))).toEqual({
          [INSTAGRAM_TIERS]: 'Minimal 1 tier.',
        });
      });

      it.each([
        ['a tier that is not an object', [null]],
        ['a tier that is a list', [[]]],
        ['a missing minimum', [{ bonus: 1 }]],
        ['a minimum in a string', [{ threshold: '100', bonus: 1 }]],
        ['a fractional minimum', [{ threshold: 100.5, bonus: 1 }]],
        ['a bonus in a string', [{ threshold: 100, bonus: '1' }]],
        ['a fractional bonus', [{ threshold: 100, bonus: 0.5 }]],
        ['an infinite bonus', [{ threshold: 100, bonus: Infinity }]],
      ])('rejects %s', (_, value) => {
        expect(errorsFor(withTiers(value))).toEqual({
          [INSTAGRAM_TIERS]: 'Minimum dan bonus harus angka bulat.',
        });
      });

      it.each([
        ['a zero minimum', { threshold: 0, bonus: 1 }],
        ['a zero bonus', { threshold: 1, bonus: 0 }],
        ['a negative minimum', { threshold: -1, bonus: 1 }],
        ['a negative bonus', { threshold: 1, bonus: -1 }],
      ])('rejects %s', (_, tier) => {
        expect(errorsFor(withTiers([tier]))).toEqual({
          [INSTAGRAM_TIERS]: 'Minimum dan bonus harus lebih dari 0.',
        });
      });

      it.each([
        ['minimum', { threshold: MAX_TIER_AMOUNT + 1, bonus: 1 }],
        ['bonus', { threshold: 1, bonus: MAX_TIER_AMOUNT + 1 }],
      ])('rejects a %s past 999.999.999', (_, tier) => {
        expect(errorsFor(withTiers([tier]))).toEqual({
          [INSTAGRAM_TIERS]: 'Angka terlalu besar.',
        });
      });

      it('rejects two tiers with the same minimum', () => {
        expect(
          errorsFor(
            withTiers([
              { threshold: 100, bonus: 1 },
              { threshold: 100, bonus: 2 },
            ]),
          ),
        ).toEqual({
          [INSTAGRAM_TIERS]: 'Minimum tiap tier harus berbeda.',
        });
      });

      it.each([
        ['falls', [{ threshold: 100, bonus: 500000 }, { threshold: 200, bonus: 100000 }]],
        ['stays the same', [{ threshold: 100, bonus: 100000 }, { threshold: 200, bonus: 100000 }]],
        // Out of order as sent, but sorted by minimum the bonus falls.
        ['falls once sorted', [{ threshold: 200, bonus: 100000 }, { threshold: 100, bonus: 500000 }]],
      ])('rejects a bonus that %s as the minimum rises', (_, value) => {
        expect(errorsFor(withTiers(value))).toEqual({
          [INSTAGRAM_TIERS]: 'Bonus harus naik seiring minimum.',
        });
      });

      it('reports one error per platform, the first the prototype would show', () => {
        expect(
          errorsFor(
            withTiers([
              { threshold: 0, bonus: 1 },
              { threshold: MAX_TIER_AMOUNT + 1, bonus: 1 },
            ]),
          ),
        ).toEqual({
          [INSTAGRAM_TIERS]: 'Minimum dan bonus harus lebih dari 0.',
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
          latePenaltyPerDay: 'Penalti wajib diisi',
          maxPenaltyDays: 'Maks hari penalti wajib diisi',
          performanceBonus: 'Bonus performa wajib diisi',
        });
      },
    );
  });

  it('reports every invalid field at once', () => {
    expect(
      errorsFor({
        specificBonus: -1,
        latePenaltyPerDay: '5',
        maxPenaltyDays: 400,
        performanceBonus: {
          instagram: { metric: 'reach', tiers: [] },
          tiktok: { metric: 'views', tiers: [{ threshold: 1, bonus: 0 }] },
        },
      }),
    ).toEqual({
      specificBonus: 'Bonus Specific harus antara Rp0 dan Rp10.000.000',
      latePenaltyPerDay: 'Penalti harus berupa angka',
      maxPenaltyDays: 'Maks hari penalti harus antara 0 hari dan 365 hari',
      'performanceBonus.instagram.metric':
        'Metrik harus views, likes, comments, atau shares',
      [INSTAGRAM_TIERS]: 'Minimal 1 tier.',
      'performanceBonus.tiktok.tiers': 'Minimum dan bonus harus lebih dari 0.',
    });
  });
});
