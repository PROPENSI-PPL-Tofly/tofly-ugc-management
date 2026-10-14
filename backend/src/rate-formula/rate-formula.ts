import { UnprocessableEntityException } from '@nestjs/common';
import type { performance_metric, social_platform } from '@prisma/client';
import { SOCIAL_PLATFORMS } from '../creators/new-creator.js';

// The limits and messages follow the Atur Formula Rate modal of the Tofly Module 1 prototype.

/** Bonus Specific, in whole rupiah (FV.fFormulaSpecific). */
export const MAX_SPECIFIC_BONUS = 10_000_000;
/** Penalti per hari, in whole rupiah (FV.fFormulaPenalty). */
export const MAX_LATE_PENALTY_PER_DAY = 1_000_000;
/** The largest tier minimum or bonus the prototype takes. */
export const MAX_TIER_AMOUNT = 999_999_999;

/** What a platform's tier minimums count, in the order the prototype offers them. */
export const PERFORMANCE_METRICS: readonly performance_metric[] = [
  'views',
  'likes',
  'comments',
  'shares',
];

/** One performance bonus tier: `threshold` is the minimum count of the platform's metric. */
export interface PerformanceBonusTier {
  threshold: number;
  bonus: number;
}

/** One platform's metric and its tiers, in threshold order. */
export interface PlatformPerformanceBonus {
  metric: performance_metric;
  tiers: PerformanceBonusTier[];
}

/** The formula as PUT /rate-formula saves it: already validated, only the fields it has. */
export interface RateFormula {
  specificBonus: number;
  latePenaltyPerDay: number;
  performanceBonus: Record<social_platform, PlatformPerformanceBonus>;
}

/** Keyed by field path, so the form can show each error under its input. */
export type RateFormulaErrors = Partial<Record<string, string>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMissing(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

/** Rupiah as the prototype writes it: Rp10.000.000. */
function rupiah(value: number): string {
  return `Rp${String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

/**
 * Reads one whole-rupiah amount and records what is wrong with it under `key`. Only a JSON
 * number counts: "7" or true would be coerced by JavaScript but mean the client is sending
 * something other than what the form holds.
 */
function checkAmount(
  key: string,
  label: string,
  max: number,
  value: unknown,
  errors: RateFormulaErrors,
): void {
  if (isMissing(value)) {
    errors[key] = `${label} wajib diisi`;
  } else if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors[key] = `${label} harus berupa angka`;
  } else if (!Number.isInteger(value)) {
    errors[key] = `${label} harus angka bulat`;
  } else if (value < 0 || value > max) {
    errors[key] = `${label} harus antara ${rupiah(0)} dan ${rupiah(max)}`;
  }
}

function checkMetric(
  key: string,
  value: unknown,
  errors: RateFormulaErrors,
): performance_metric {
  if (isMissing(value)) {
    errors[key] = 'Metrik wajib dipilih';
  } else if (!PERFORMANCE_METRICS.includes(value as performance_metric)) {
    errors[key] = 'Metrik harus views, likes, comments, atau shares';
  }
  return value as performance_metric;
}

/** Whether a tier holds a whole-number minimum and bonus, before any range is checked. */
function isWholeTier(tier: unknown): tier is PerformanceBonusTier {
  return (
    isRecord(tier) &&
    Number.isInteger(tier.threshold) &&
    Number.isInteger(tier.bonus)
  );
}

/**
 * What is wrong with a platform's tiers, sorted by minimum: the first rule they break, in the
 * order the prototype's bonusError checks them, or undefined when there is none.
 */
function tiersError(
  platform: social_platform,
  tiers: unknown,
): string | undefined {
  if (!Array.isArray(tiers)) {
    return `Tier bonus ${platform} wajib berupa daftar`;
  }
  if (tiers.length === 0) {
    return 'Minimal 1 tier.';
  }
  if (!tiers.every(isWholeTier)) {
    return 'Minimum dan bonus harus angka bulat.';
  }
  if (tiers.some(({ threshold, bonus }) => threshold <= 0 || bonus <= 0)) {
    return 'Minimum dan bonus harus lebih dari 0.';
  }
  if (
    tiers.some(
      ({ threshold, bonus }) =>
        threshold > MAX_TIER_AMOUNT || bonus > MAX_TIER_AMOUNT,
    )
  ) {
    return 'Angka terlalu besar.';
  }
  const sorted = sortTiers(tiers);
  const pairs = sorted.slice(1).map((tier, index) => [sorted[index], tier]);
  if (pairs.some(([lower, higher]) => lower.threshold === higher.threshold)) {
    return 'Minimum tiap tier harus berbeda.';
  }
  if (pairs.some(([lower, higher]) => higher.bonus <= lower.bonus)) {
    return 'Bonus harus naik seiring minimum.';
  }
  return undefined;
}

/** The tiers copied down to minimum and bonus, sorted by minimum as the prototype saves them. */
function sortTiers(tiers: PerformanceBonusTier[]): PerformanceBonusTier[] {
  return tiers
    .map(({ threshold, bonus }) => ({ threshold, bonus }))
    .sort((a, b) => a.threshold - b.threshold);
}

/** One platform's metric and tiers, each error recorded under the field it belongs to. */
function checkPlatform(
  platform: social_platform,
  value: unknown,
  errors: RateFormulaErrors,
): PlatformPerformanceBonus {
  const key = `performanceBonus.${platform}`;
  if (!isRecord(value)) {
    errors[key] = `Bonus performa ${platform} wajib diisi`;
    return { metric: 'views', tiers: [] };
  }

  const metric = checkMetric(`${key}.metric`, value.metric, errors);
  const error = tiersError(platform, value.tiers);
  if (error) {
    errors[`${key}.tiers`] = error;
    return { metric, tiers: [] };
  }
  return { metric, tiers: sortTiers(value.tiers as PerformanceBonusTier[]) };
}

/**
 * Every platform's metric and tiers. A PUT replaces the whole formula, so each platform must be
 * present rather than dropped by omission; a platform the database's `social_platform` enum does
 * not know is rejected.
 */
function checkPerformanceBonus(
  value: unknown,
  errors: RateFormulaErrors,
): RateFormula['performanceBonus'] {
  const performanceBonus = {} as RateFormula['performanceBonus'];
  if (!isRecord(value)) {
    errors.performanceBonus = 'Bonus performa wajib diisi';
    return performanceBonus;
  }

  for (const key of Object.keys(value)) {
    if (!SOCIAL_PLATFORMS.includes(key as social_platform)) {
      errors[`performanceBonus.${key}`] =
        'Platform harus instagram atau tiktok';
    }
  }
  for (const platform of SOCIAL_PLATFORMS) {
    performanceBonus[platform] = checkPlatform(
      platform,
      value[platform],
      errors,
    );
  }
  return performanceBonus;
}

/**
 * Checks a PUT /rate-formula body and copies out the fields the formula has; anything else,
 * such as a content fee or an audit column, is dropped. Throws a 422 listing every invalid field.
 */
export function checkRateFormula(input: unknown): RateFormula {
  const body = isRecord(input) ? input : {};
  const errors: RateFormulaErrors = {};

  const { specificBonus, latePenaltyPerDay } = body;
  checkAmount(
    'specificBonus',
    'Bonus Specific',
    MAX_SPECIFIC_BONUS,
    specificBonus,
    errors,
  );
  checkAmount(
    'latePenaltyPerDay',
    'Penalti',
    MAX_LATE_PENALTY_PER_DAY,
    latePenaltyPerDay,
    errors,
  );
  const performanceBonus = checkPerformanceBonus(body.performanceBonus, errors);

  if (Object.keys(errors).length > 0) {
    throw new UnprocessableEntityException({
      message: 'Formula rate tidak valid',
      errors,
    });
  }

  return {
    specificBonus: specificBonus as number,
    latePenaltyPerDay: latePenaltyPerDay as number,
    performanceBonus,
  };
}
