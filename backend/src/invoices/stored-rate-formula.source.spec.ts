import type { RateFormulaService } from '../rate-formula/rate-formula.service.js';
import { DEFAULT_MAX_PENALTY_DAYS } from './rate-formula.js';
import {
  type StoredFormula,
  StoredRateFormulaSource,
  toRateFormula,
} from './stored-rate-formula.source.js';

function saved(overrides: Partial<StoredFormula> = {}): StoredFormula {
  return {
    configured: true,
    specificBonus: 100_000,
    latePenaltyPerDay: 15_000,
    updatedAt: '2026-10-14T00:00:00.000Z',
    performanceBonus: {
      instagram: {
        metric: 'views',
        tiers: [{ threshold: 10_000, bonus: 150_000 }],
      },
      tiktok: { metric: 'shares', tiers: [{ threshold: 100, bonus: 50_000 }] },
    },
    ...overrides,
  } as StoredFormula;
}

describe('toRateFormula', () => {
  it('reads the saved amounts and tiers under the names 8.1 stores them by', () => {
    expect(toRateFormula(saved({ maxPenaltyDays: 5 }))).toEqual({
      latePenaltyPerDay: 15_000,
      maxPenaltyDays: 5,
      specificBonus: 100_000,
      performanceBonus: {
        instagram: {
          metric: 'views',
          tiers: [{ threshold: 10_000, bonus: 150_000 }],
        },
        tiktok: {
          metric: 'shares',
          tiers: [{ threshold: 100, bonus: 50_000 }],
        },
      },
    });
  });

  it.each([
    ['saved before the column existed (null)', null],
    ['from a backend without the column yet', undefined],
  ])(
    'caps the penalty at the default for a formula %s',
    (_, maxPenaltyDays) => {
      expect(toRateFormula(saved({ maxPenaltyDays }))?.maxPenaltyDays).toBe(
        DEFAULT_MAX_PENALTY_DAYS,
      );
    },
  );

  it('leaves out a platform nobody picked a metric for', () => {
    const formula = toRateFormula(
      saved({
        performanceBonus: {
          instagram: { metric: null, tiers: [] },
          tiktok: {
            metric: 'likes',
            tiers: [{ threshold: 1_000, bonus: 50_000 }],
          },
        },
      }),
    );

    expect(Object.keys(formula?.performanceBonus ?? {})).toEqual(['tiktok']);
  });

  it('is null while no admin has saved a formula', () => {
    expect(
      toRateFormula({
        configured: false,
        specificBonus: null,
        latePenaltyPerDay: null,
        maxPenaltyDays: null,
        updatedAt: null,
        performanceBonus: {
          instagram: { metric: null, tiers: [] },
          tiktok: { metric: null, tiers: [] },
        },
      }),
    ).toBeNull();
  });
});

describe('StoredRateFormulaSource', () => {
  it('reads the formula through the 8.1 service', async () => {
    const formulas = { read: vi.fn().mockResolvedValue(saved()) };
    const source = new StoredRateFormulaSource(
      formulas as unknown as RateFormulaService,
    );

    await expect(source.current()).resolves.toMatchObject({
      latePenaltyPerDay: 15_000,
      specificBonus: 100_000,
    });
    expect(formulas.read).toHaveBeenCalledTimes(1);
  });
});
