// What the Atur Formula Rate modal holds and checks (PBI-8): the daily late penalty, the Specific
// bonus, and the performance bonus tiers per platform. Pure, so every rule is testable without
// rendering anything. The shapes follow PUT /rate-formula of the backend (rate-formula.ts).

import { amountProblem } from "./amount";

/** Most tiers one platform takes. */
export const MAX_TIERS = 5;

/** Most days a late content is penalised for; the backend refuses a cap above this (8.1). */
export const MAX_PENALTY_DAYS = 365;

export type BonusPlatform = "instagram" | "tiktok";

/** The platforms a bonus is set for, in the order the modal lists them. */
export const BONUS_PLATFORMS: readonly BonusPlatform[] = ["instagram", "tiktok"];

export const PLATFORM_LABELS: Record<BonusPlatform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
};

/** What a platform's tier minimums count. */
export type PerformanceMetric = "views" | "likes" | "comments" | "shares";

/** The metrics the modal offers, in order. */
export const PERFORMANCE_METRICS: readonly PerformanceMetric[] = [
  "views",
  "likes",
  "comments",
  "shares",
];

export const METRIC_LABELS: Record<PerformanceMetric, string> = {
  views: "Views",
  likes: "Likes",
  comments: "Comments",
  shares: "Shares",
};

/** One tier as the admin is typing it: either number may still be empty. */
export interface TierDraft {
  threshold: number | null;
  bonus: number | null;
}

export interface PlatformDraft {
  metric: PerformanceMetric;
  tiers: TierDraft[];
}

/** The whole modal form. Every amount is in rupiah; null while the field is empty. */
export interface RateFormulaDraft {
  latePenaltyPerDay: number | null;
  maxPenaltyDays: number | null;
  specificBonus: number | null;
  performanceBonus: Record<BonusPlatform, PlatformDraft>;
}

/**
 * Where a message belongs. A field's own key for the three amounts; `performanceBonus.<platform>`
 * for everything about one platform's metric and tiers, shown under its tier rows.
 */
export type RateFormulaErrors = Partial<Record<string, string>>;

export function platformErrorKey(platform: BonusPlatform): string {
  return `performanceBonus.${platform}`;
}

/** What GET and PUT /rate-formula answer; a platform nobody configured has a null metric. */
export interface RateFormulaView {
  configured: boolean;
  specificBonus: number | null;
  latePenaltyPerDay: number | null;
  /** Not stored by the backend yet; absent from its answer until it is. */
  maxPenaltyDays?: number | null;
  performanceBonus: Record<
    BonusPlatform,
    { metric: PerformanceMetric | null; tiers: { threshold: number; bonus: number }[] }
  >;
}

/** What PUT /rate-formula takes: the draft once it validates. */
export interface RateFormulaRequest {
  latePenaltyPerDay: number;
  maxPenaltyDays: number;
  specificBonus: number;
  performanceBonus: Record<
    BonusPlatform,
    { metric: PerformanceMetric; tiers: { threshold: number; bonus: number }[] }
  >;
}

export const EMPTY_TIER: TierDraft = { threshold: null, bonus: null };

const DEFAULT_METRIC: PerformanceMetric = "views";

function platformDraft(stored: RateFormulaView["performanceBonus"][BonusPlatform]): PlatformDraft {
  return {
    metric: stored.metric ?? DEFAULT_METRIC,
    // A platform with no tiers yet starts on one empty row, ready to fill in.
    tiers: stored.tiers.length > 0 ? stored.tiers.map((tier) => ({ ...tier })) : [EMPTY_TIER],
  };
}

/** The form for what is saved, or a blank one when nothing has been configured yet. */
export function draftFromView(view: RateFormulaView): RateFormulaDraft {
  return {
    latePenaltyPerDay: view.latePenaltyPerDay,
    maxPenaltyDays: view.maxPenaltyDays ?? null,
    specificBonus: view.specificBonus,
    performanceBonus: {
      instagram: platformDraft(view.performanceBonus.instagram),
      tiktok: platformDraft(view.performanceBonus.tiktok),
    },
  };
}

/** Changes one tier's minimum or bonus, leaving every other tier as it was. */
export function updateTier(
  tiers: TierDraft[],
  index: number,
  change: Partial<TierDraft>,
): TierDraft[] {
  return tiers.map((tier, at) => (at === index ? { ...tier, ...change } : tier));
}

/** One more empty tier, unless the platform already has MAX_TIERS. */
export function addTier(tiers: TierDraft[]): TierDraft[] {
  return tiers.length >= MAX_TIERS ? tiers : [...tiers, EMPTY_TIER];
}

export function removeTier(tiers: TierDraft[], index: number): TierDraft[] {
  return tiers.filter((_, at) => at !== index);
}

/** A platform's metric changed: what its minimums counted no longer holds, so the tiers restart. */
export function changeMetric(metric: PerformanceMetric): PlatformDraft {
  return { metric, tiers: [EMPTY_TIER] };
}

function isFilled(tier: TierDraft): tier is { threshold: number; bonus: number } {
  return tier.threshold !== null && tier.bonus !== null;
}

/**
 * What is wrong with a platform's tiers: the first rule they break, or undefined when they are
 * fine. Checked in the order a person would fix them: some tiers, each filled in with numbers
 * above 0, minimums that differ, then bonuses that grow with the minimum.
 */
export function tiersProblem(tiers: TierDraft[]): string | undefined {
  if (tiers.length === 0) return "Minimal 1 tier.";

  const filled = tiers.filter(isFilled);
  if (filled.length < tiers.length || filled.some((tier) => tier.threshold <= 0 || tier.bonus <= 0)) {
    return "Minimum dan bonus harus lebih dari 0.";
  }

  // Above 0 and whole already; what is left for amountProblem to catch is more than ten digits.
  if (filled.some(({ threshold, bonus }) => amountProblem(threshold, "") || amountProblem(bonus, ""))) {
    return "Angka terlalu besar.";
  }

  const sorted = [...filled].sort((a, b) => a.threshold - b.threshold);
  const pairs = sorted.slice(1).map((tier, index) => [sorted[index], tier]);
  if (pairs.some(([lower, higher]) => lower.threshold === higher.threshold)) {
    return "Minimum tiap tier harus berbeda.";
  }
  if (pairs.some(([lower, higher]) => higher.bonus <= lower.bonus)) {
    return "Bonus harus naik seiring minimum.";
  }
  return undefined;
}

/** What is wrong with the day cap: an amount that is filled in, whole, and no more than a year. */
function penaltyDaysProblem(value: number | null): string | undefined {
  const problem = amountProblem(value, "Maks hari penalti");
  if (problem) return problem;
  return (value ?? 0) > MAX_PENALTY_DAYS
    ? `Maks hari penalti harus antara 0 hari dan ${MAX_PENALTY_DAYS} hari`
    : undefined;
}

/** Every problem in the form, each under the key of the field it belongs to. */
export function validateRateFormula(draft: RateFormulaDraft): RateFormulaErrors {
  const errors: RateFormulaErrors = {};

  const amounts = [
    ["latePenaltyPerDay", "Penalti per hari"],
    ["specificBonus", "Bonus Specific"],
  ] as const;
  for (const [field, label] of amounts) {
    const problem = amountProblem(draft[field], label);
    if (problem) errors[field] = problem;
  }

  const days = penaltyDaysProblem(draft.maxPenaltyDays);
  if (days) errors.maxPenaltyDays = days;

  for (const platform of BONUS_PLATFORMS) {
    const problem = tiersProblem(draft.performanceBonus[platform].tiers);
    if (problem) errors[platformErrorKey(platform)] = problem;
  }

  return errors;
}

/**
 * The request for a draft that validates, tiers in increasing order of minimum. Throws for one
 * that does not: the modal never calls it before validateRateFormula comes back empty.
 */
export function toRateFormulaRequest(draft: RateFormulaDraft): RateFormulaRequest {
  const { latePenaltyPerDay, maxPenaltyDays, specificBonus } = draft;
  if (latePenaltyPerDay === null || maxPenaltyDays === null || specificBonus === null) {
    throw new Error("The rate formula is not filled in");
  }

  const platform = (name: BonusPlatform) => {
    const { metric, tiers } = draft.performanceBonus[name];
    const filled = tiers.filter(isFilled).sort((a, b) => a.threshold - b.threshold);
    if (filled.length !== tiers.length) throw new Error(`A ${name} tier is not filled in`);
    return { metric, tiers: filled };
  };

  return {
    latePenaltyPerDay,
    maxPenaltyDays,
    specificBonus,
    performanceBonus: { instagram: platform("instagram"), tiktok: platform("tiktok") },
  };
}

/** Whether the form differs from how it was opened, for the "discard what you typed?" guard. */
export function isRateFormulaDirty(draft: RateFormulaDraft, opened: RateFormulaDraft): boolean {
  return JSON.stringify(draft) !== JSON.stringify(opened);
}
