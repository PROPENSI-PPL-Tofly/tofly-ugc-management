import type { RateFormulaView } from "./rate-formula";

/** A formula the admin has saved: two Instagram tiers on Views, one TikTok tier on Likes. */
export const SAVED_FORMULA: RateFormulaView = {
  configured: true,
  specificBonus: 100000,
  latePenaltyPerDay: 50000,
  maxPenaltyDays: 3,
  performanceBonus: {
    instagram: {
      metric: "views",
      tiers: [
        { threshold: 10000, bonus: 150000 },
        { threshold: 40000, bonus: 400000 },
      ],
    },
    tiktok: { metric: "likes", tiers: [{ threshold: 500, bonus: 50000 }] },
  },
};

/** What the backend answers before anyone has saved a formula: no amounts, no metrics. */
export const UNCONFIGURED_FORMULA: RateFormulaView = {
  configured: false,
  specificBonus: null,
  latePenaltyPerDay: null,
  performanceBonus: {
    instagram: { metric: null, tiers: [] },
    tiktok: { metric: null, tiers: [] },
  },
};
