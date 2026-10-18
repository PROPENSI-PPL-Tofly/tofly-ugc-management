// A stand-in for the per-creator breakdown subtask 8.3 will serve (TODO(SCRUM-8.3)), built from
// the invoice table's own fixture so a popup always adds up to the cell it was opened from.
// Deleted whole when the real endpoint lands: invoice-breakdown.server.ts then asks the backend.
//
// The lines are invented but follow the prototype's rules: the fixed rate is the contract
// period's value, a penalty charges at most three days per content, and a performance bonus is
// its tier's amount. Content ids name no real content, so the Content Detail panel they open
// says it cannot load one until 8.3 sends real ids.

import { INVOICE_FIXTURE_ROWS } from "./invoice.fixture";
import type {
  BonusLine,
  BonusRules,
  FixedPeriod,
  InvoiceBreakdown,
  PenaltyLine,
  RatedLine,
} from "./invoice-breakdown";
import type { RawInvoiceRow } from "./invoice-api";

const EXTRA_RATE = 250000;
const PENALTY_PER_DAY = 50000;
/** The prototype stops charging a late content after this many days (decision of 12 Oct 2026). */
const MAX_PENALTY_DAYS = 3;
const QUOTA = 12;

/** The rate formula the fixture's bonuses are paid under, as 8.1 would hold it. */
const RULES: BonusRules = {
  tiers: [
    {
      platform: "instagram",
      metric: "views",
      steps: [
        { min: 10000, bonus: 50000 },
        { min: 50000, bonus: 150000 },
      ],
    },
    { platform: "tiktok", metric: "views", steps: [{ min: 10000, bonus: 50000 }] },
  ],
  specificBonus: 100000,
};

/** What each Instagram tier pays and a number of views that reaches it, highest first. */
const TIERS = [
  { tier: 2, bonus: 150000, value: 62000 },
  { tier: 1, bonus: 50000, value: 12500 },
];

function firstName(row: RawInvoiceRow): string {
  return row.name.split(" ")[0];
}

/** One period of the contract, with as much of the quota done as the contract's state allows. */
function periodOf(row: RawInvoiceRow): FixedPeriod {
  const done = { active: 7, expired: QUOTA, upcoming: 0 }[row.contractStatus];

  return { number: 1, start: "2026-09-01", end: "2026-11-30", quotaDone: done, quotaTotal: QUOTA };
}

/** The extra fees as as many contents as it takes at the extra rate. */
function extras(row: RawInvoiceRow): RatedLine[] {
  return Array.from({ length: row.extraAmount / EXTRA_RATE }, (_, index) => ({
    contentId: `fixture-${row.creatorId}-extra-${index + 1}`,
    name: `Konten Tambahan ${index + 1} ${firstName(row)}`,
    rate: EXTRA_RATE,
    amount: EXTRA_RATE,
  }));
}

/** A Specific bonus first, then performance tiers, the highest that still fits, for the rest. */
function bonuses(row: RawInvoiceRow): BonusLine[] {
  const amount = row.bonusAmount ?? 0;
  if (amount === 0) return [];

  const lines: BonusLine[] = [
    {
      kind: "specific",
      contentId: `fixture-${row.creatorId}-bonus-specific`,
      name: `Promo Specific ${firstName(row)}`,
      amount: Math.min(amount, RULES.specificBonus),
    },
  ];
  let left = amount - RULES.specificBonus;
  while (left > 0) {
    // The fixture's bonuses are whole multiples of the lowest tier, so one always fits.
    const reached = TIERS.find((tier) => tier.bonus <= left) as (typeof TIERS)[number];
    lines.push({
      kind: "performance",
      contentId: `fixture-${row.creatorId}-bonus-${lines.length}`,
      name: `Evg_${lines.length}_${firstName(row)}`,
      platform: "instagram",
      metric: "views",
      value: reached.value,
      tier: reached.tier,
      amount: reached.bonus,
    });
    left -= reached.bonus;
  }
  return lines;
}

/** The days the penalty pays for, as late contents charged at most the cap each. */
function penalties(row: RawInvoiceRow): PenaltyLine[] {
  const lines: PenaltyLine[] = [];
  let days = row.penaltyAmount / PENALTY_PER_DAY;

  while (days > 0) {
    const charged = Math.min(days, MAX_PENALTY_DAYS);
    lines.push({
      contentId: `fixture-${row.creatorId}-penalty-${lines.length + 1}`,
      name: `Evg_${lines.length + 2}_${firstName(row)}`,
      // A content at the cap was later than it is charged for.
      daysLate: charged === MAX_PENALTY_DAYS ? charged + 2 : charged,
      chargedDays: charged,
      ratePerDay: PENALTY_PER_DAY,
      amount: charged * PENALTY_PER_DAY,
      // Still counting while the contract runs and the cap is not reached.
      ongoing: charged < MAX_PENALTY_DAYS && row.contractStatus === "active",
    });
    days -= charged;
  }
  return lines;
}

function breakdownOf(row: RawInvoiceRow): InvoiceBreakdown {
  return {
    creatorName: row.name,
    fixed: {
      period: periodOf(row),
      total: row.fixedAmount,
      notStarted: row.contractStatus === "upcoming" && row.fixedAmount === 0,
    },
    extra: { lines: extras(row), total: row.extraAmount },
    bonus: {
      lines: bonuses(row),
      total: row.bonusAmount ?? 0,
      performance: row.bonusAmount === null ? "waiting" : "ready",
      rules: RULES,
    },
    penalty: { lines: penalties(row), total: row.penaltyAmount },
  };
}

/** The breakdown of one creator in the table's fixture, or null for any other id. */
export function invoiceBreakdownFixture(creatorId: string): InvoiceBreakdown | null {
  // Matched against each row's own id, so no name a caller sends reaches an object's prototype.
  const row = INVOICE_FIXTURE_ROWS.find((candidate) => candidate.creatorId === creatorId);

  return row ? breakdownOf(row) : null;
}
