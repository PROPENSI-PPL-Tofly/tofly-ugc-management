// A test data builder for the creator's invoices: one running invoice with every field set, and
// each test overrides only the fields it is about, so a test reads as the case it checks. Test
// data only: nothing the app renders imports this.

import type { CreatorInvoice, ReachedAt } from "./creator-invoice";

export const NONE_REACHED: ReachedAt = {
  finalized: null,
  creator_acked: null,
  payment_uploaded: null,
  paid: null,
};

export function aCreatorInvoice(overrides: Partial<CreatorInvoice> = {}): CreatorInvoice {
  return {
    contractId: "6917ccf7-36a2-44d4-9222-ca3558f54a54",
    periodNumber: 1,
    periodStart: "2026-09-01",
    periodEnd: "2026-11-30",
    notStarted: false,
    status: "accruing",
    fixedAmount: 500000,
    extraAmount: 200000,
    bonusAmount: null,
    penaltyAmount: 150000,
    adjustments: [],
    totalAmount: 550000,
    floored: false,
    breakdown: {
      creatorName: "Rangga Pratama",
      fixed: {
        period: { number: 1, start: "2026-09-01", end: "2026-11-30", quotaDone: 4, quotaTotal: 9 },
        total: 500000,
        notStarted: false,
      },
      extra: {
        lines: [
          { contentId: "a1a1a1a1-0000-4000-8000-000000000001", name: "Review layanan same-day", rate: 100000, amount: 100000 },
          { contentId: "a1a1a1a1-0000-4000-8000-000000000002", name: "Promo akhir bulan", rate: 100000, amount: 100000 },
        ],
        total: 200000,
      },
      bonus: {
        lines: [],
        total: 0,
        performance: "waiting",
        rules: {
          tiers: [{ platform: "instagram", metric: "views", steps: [{ min: 10000, bonus: 50000 }] }],
          specificBonus: 0,
        },
      },
      penalty: {
        lines: [
          {
            contentId: "a1a1a1a1-0000-4000-8000-000000000004",
            name: "Cara lacak paket",
            daysLate: 5,
            chargedDays: 3,
            ratePerDay: 50000,
            amount: 150000,
            ongoing: false,
          },
        ],
        total: 150000,
      },
    },
    reachedAt: NONE_REACHED,
    proof: null,
    comments: [],
    ...overrides,
  };
}
