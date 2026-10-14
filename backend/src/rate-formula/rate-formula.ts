import { UnprocessableEntityException } from '@nestjs/common';
import type { social_platform } from '@prisma/client';
import { SOCIAL_PLATFORMS } from '../creators/new-creator.js';

/**
 * rate_formula and performance_bonus_tiers amounts are numeric(12, 2): ten digits before the
 * point, two after. Provisional for the formula; contracts.fixed_rate allows twelve.
 */
export const MAX_MONEY = 9_999_999_999.99;
/** The Atur Formula Rate form holds up to five tiers per platform. */
export const MAX_TIERS_PER_PLATFORM = 5;

/**
 * One performance bonus tier. What `threshold` counts, and in which unit, is for the performance
 * calculation (PBI-19) to settle; until then it takes the same numbers as an amount.
 */
export interface PerformanceBonusTier {
  threshold: number;
  bonus: number;
}

/** The formula as PUT /rate-formula saves it: already validated, only the fields it has. */
export interface RateFormula {
  specificBonus: number;
  latePenaltyPerDay: number;
  /** Every platform, in threshold order; a platform with no tiers has an empty list. */
  performanceBonusTiers: Record<social_platform, PerformanceBonusTier[]>;
}

/** Keyed by field path, so the form can show each error under its input. */
export type RateFormulaErrors = Partial<Record<string, string>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasCents(value: number): boolean {
  return Number(value.toFixed(2)) === value;
}

/**
 * Reads one amount and records what is wrong with it under `key`. Only a JSON number counts:
 * "7" or true would be coerced by JavaScript but mean the client is sending something other
 * than what the form holds. Returns whether the amount is valid.
 */
function checkAmount(
  key: string,
  label: string,
  value: unknown,
  errors: RateFormulaErrors,
): value is number {
  if (value === undefined || value === null || value === '') {
    errors[key] = `${label} wajib diisi`;
  } else if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors[key] = `${label} harus berupa angka`;
  } else if (value < 0) {
    errors[key] = `${label} tidak boleh negatif`;
  } else if (!hasCents(value)) {
    errors[key] = `${label} maksimal 2 angka desimal`;
  } else if (value > MAX_MONEY) {
    errors[key] = `${label} maksimal 10 digit sebelum koma`;
  } else {
    return true;
  }
  return false;
}

/** One platform's tiers, copied down to threshold and bonus. */
function checkTiers(
  platform: social_platform,
  value: unknown,
  errors: RateFormulaErrors,
): PerformanceBonusTier[] {
  const key = `performanceBonusTiers.${platform}`;
  if (!Array.isArray(value)) {
    errors[key] = `Tier bonus ${platform} wajib berupa daftar`;
    return [];
  }
  if (value.length > MAX_TIERS_PER_PLATFORM) {
    errors[key] = `Maksimal ${MAX_TIERS_PER_PLATFORM} tier per platform`;
    return [];
  }

  // The last valid threshold: an invalid one already has its own error, so it is not restated
  // as out of order, and the next one is compared with the last that was valid.
  let previous: number | undefined;
  return value.map((tier: unknown, index) => {
    const tierKey = `${key}.${index}`;
    if (!isRecord(tier)) {
      errors[tierKey] = 'Tier tidak valid';
      return { threshold: 0, bonus: 0 };
    }

    const { threshold, bonus } = tier;
    if (checkAmount(`${tierKey}.threshold`, 'Threshold', threshold, errors)) {
      if (previous !== undefined && threshold <= previous) {
        errors[`${tierKey}.threshold`] =
          'Threshold harus lebih besar dari tier sebelumnya';
      }
      previous = threshold;
    }
    checkAmount(`${tierKey}.bonus`, 'Bonus', bonus, errors);
    return { threshold: threshold as number, bonus: bonus as number };
  });
}

/**
 * Every platform's tiers. A PUT replaces the whole formula, so each platform must be present,
 * even with an empty list, rather than dropped by omission; a platform the database's
 * `social_platform` enum does not know is rejected.
 */
function checkAllTiers(
  value: unknown,
  errors: RateFormulaErrors,
): RateFormula['performanceBonusTiers'] {
  const tiers = { instagram: [], tiktok: [] } as RateFormula['performanceBonusTiers'];
  if (!isRecord(value)) {
    errors.performanceBonusTiers = 'Tier bonus performa wajib diisi';
    return tiers;
  }

  for (const key of Object.keys(value)) {
    if (!SOCIAL_PLATFORMS.includes(key as social_platform)) {
      errors[`performanceBonusTiers.${key}`] =
        'Platform harus instagram atau tiktok';
    }
  }
  for (const platform of SOCIAL_PLATFORMS) {
    tiers[platform] = checkTiers(platform, value[platform], errors);
  }
  return tiers;
}

/**
 * Checks a PUT /rate-formula body and copies out the fields the formula has; anything else,
 * such as a content fee or an audit column, is dropped. Throws a 422 listing every invalid field.
 */
export function checkRateFormula(input: unknown): RateFormula {
  const body = isRecord(input) ? input : {};
  const errors: RateFormulaErrors = {};

  const { specificBonus, latePenaltyPerDay } = body;
  checkAmount('specificBonus', 'Bonus Specific', specificBonus, errors);
  checkAmount('latePenaltyPerDay', 'Penalti per hari', latePenaltyPerDay, errors);
  const performanceBonusTiers = checkAllTiers(body.performanceBonusTiers, errors);

  if (Object.keys(errors).length > 0) {
    throw new UnprocessableEntityException({
      message: 'Formula rate tidak valid',
      errors,
    });
  }

  return {
    specificBonus: specificBonus as number,
    latePenaltyPerDay: latePenaltyPerDay as number,
    performanceBonusTiers,
  };
}
