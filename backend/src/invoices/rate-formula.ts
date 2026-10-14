// The rate formula an invoice is calculated with (PBI-8). Admins set it in "Atur Formula Rate";
// storing it is subtask 8.1. Until that lands, the calculator reads a placeholder through the
// same RateFormulaSource port, so swapping in the stored formula changes one provider and no
// calculation code.

import type { SocialPlatform } from './invoice-component.js';

/** A performance metric a bonus tier is measured on; the columns the contents table keeps. */
export type PerformanceMetric = 'views' | 'likes';

export interface BonusTier {
  /** The metric value a content item must reach for this tier. */
  minimum: number;
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
  penaltyPerDay: number;
  /** Lateness stops counting after this many days, so one item costs at most penaltyPerDay × this. */
  maxPenaltyDays: number;
  /** Rupiah paid per Specific (additional) content item delivered on time. */
  specificContentFee: number;
  /** Tiers per platform; a platform without an entry pays no performance bonus. */
  performanceBonus: Partial<Record<SocialPlatform, PlatformBonus>>;
}

/** Where the current formula comes from. 8.1 provides the stored one; the placeholder fills in until then. */
export interface RateFormulaSource {
  current(): Promise<RateFormula>;
}

/** Nest injection token for RateFormulaSource, since an interface does not exist at runtime. */
export const RATE_FORMULA_SOURCE = Symbol('RATE_FORMULA_SOURCE');

const VIEW_TIERS: readonly BonusTier[] = [
  { minimum: 10_000, bonus: 150_000 },
  { minimum: 40_000, bonus: 400_000 },
];

/** Placeholder values (proposed), used only until the stored formula from 8.1 exists. */
export const PLACEHOLDER_RATE_FORMULA: RateFormula = {
  penaltyPerDay: 50_000,
  maxPenaltyDays: 3,
  specificContentFee: 100_000,
  performanceBonus: {
    instagram: { metric: 'views', tiers: VIEW_TIERS },
    tiktok: { metric: 'views', tiers: VIEW_TIERS },
  },
};

export class PlaceholderRateFormulaSource implements RateFormulaSource {
  current(): Promise<RateFormula> {
    return Promise.resolve(PLACEHOLDER_RATE_FORMULA);
  }
}
