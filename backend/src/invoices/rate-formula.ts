// The rate formula an invoice is calculated with (PBI-8). Admins set it in "Atur Formula Rate",
// which 8.1 stores; the calculator reads it through the RateFormulaSource port, so where the
// formula comes from is one provider and no calculation code. The field names are the ones 8.1
// stores, so nothing is renamed between the two.

import type { SocialPlatform } from './invoice-component.js';

/** What a platform's tier thresholds count; the metrics 8.1 lets an admin pick. */
export type PerformanceMetric = 'views' | 'likes' | 'comments' | 'shares';

export interface BonusTier {
  /** The metric value a content item must reach for this tier. */
  threshold: number;
  /** Rupiah paid for reaching it. */
  bonus: number;
}

export interface PlatformBonus {
  metric: PerformanceMetric;
  /** Tiers in any order; the highest one a content item reaches is the one it is paid. */
  tiers: readonly BonusTier[];
}

export interface RateFormula {
  /** Rupiah charged per day an Evergreen content item is late. */
  latePenaltyPerDay: number;
  /** Lateness stops counting after this many days, so one item costs at most latePenaltyPerDay × this. */
  maxPenaltyDays: number;
  /** Rupiah paid per Specific (additional) content item delivered on time. */
  specificBonus: number;
  /** Tiers per platform; a platform without an entry pays no performance bonus. */
  performanceBonus: Partial<Record<SocialPlatform, PlatformBonus>>;
}

/**
 * Where the current formula comes from. Null while no admin has saved one yet: the parts of the
 * invoice that need it then wait, rather than reading a zero nobody set.
 */
export interface RateFormulaSource {
  current(): Promise<RateFormula | null>;
}

/** Nest injection token for RateFormulaSource, since an interface does not exist at runtime. */
export const RATE_FORMULA_SOURCE = Symbol('RATE_FORMULA_SOURCE');

/**
 * The penalty cap (decided 12 Oct 2026) for a formula that does not carry its own: one saved
 * before rate_formula.max_penalty_days existed (#100), whose column reads null.
 */
export const DEFAULT_MAX_PENALTY_DAYS = 3;
