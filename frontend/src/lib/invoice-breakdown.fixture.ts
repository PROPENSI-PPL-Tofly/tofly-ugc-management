// A stand-in for the per-creator breakdown subtask 8.3 will serve (TODO(SCRUM-8.3)), built from
// the invoice table's own fixture so a popup always adds up to the cell it was opened from.
// Deleted whole when the real endpoint lands: invoice-breakdown.server.ts then asks the backend.
//
// The lines are invented: one content per fixed or extra fee, one late content per penalty, and
// a Specific bonus beside a performance tier. Their ids name no real content, so the Content
// Detail panel they open says it cannot load one until 8.3 sends real ids.

import { INVOICE_FIXTURE_ROWS } from "./invoice.fixture";
import type {
  BonusLine,
  InvoiceBreakdown,
  PenaltyLine,
  RatedLine,
} from "./invoice-breakdown";
import type { RawInvoiceRow } from "./invoice-api";

/** A fixed fee per content, when the amount divides by it; a quarter of it otherwise. */
const FIXED_RATE = 500000;
const EXTRA_RATE = 250000;
const SPECIFIC_BONUS = 100000;
const PENALTY_PER_DAY = 50000;

function firstName(row: RawInvoiceRow): string {
  return row.name.split(" ")[0];
}

/** An amount cut into equal fees: as many contents as it takes at the given rate. */
function rated(
  row: RawInvoiceRow,
  column: "fixed" | "extra",
  amount: number,
  rate: number,
): RatedLine[] {
  const fee = amount % rate === 0 ? rate : rate / 2;
  const count = amount / fee;

  return Array.from({ length: count }, (_, index) => ({
    contentId: `fixture-${row.creatorId}-${column}-${index + 1}`,
    name:
      column === "fixed"
        ? `Evg_${index + 1}_${firstName(row)}`
        : `Konten Tambahan ${index + 1} ${firstName(row)}`,
    rate: fee,
    amount: fee,
  }));
}

/** A Specific bonus, and a performance tier for whatever the bonus holds beyond it. */
function bonuses(row: RawInvoiceRow): BonusLine[] {
  const amount = row.bonusAmount ?? 0;
  if (amount === 0) return [];

  const specific: BonusLine = {
    kind: "specific",
    contentId: `fixture-${row.creatorId}-bonus-specific`,
    name: `Promo Specific ${firstName(row)}`,
    amount: Math.min(amount, SPECIFIC_BONUS),
  };
  if (amount <= SPECIFIC_BONUS) return [specific];

  return [
    specific,
    {
      kind: "performance",
      contentId: `fixture-${row.creatorId}-bonus-performance`,
      name: `Evg_1_${firstName(row)}`,
      platform: "instagram",
      metric: "views",
      value: 12500,
      threshold: 10000,
      amount: amount - SPECIFIC_BONUS,
    },
  ];
}

/** One late content, late by as many days as the penalty pays for. */
function penalties(row: RawInvoiceRow): PenaltyLine[] {
  if (row.penaltyAmount === 0) return [];

  return [
    {
      contentId: `fixture-${row.creatorId}-penalty`,
      name: `Evg_2_${firstName(row)}`,
      daysLate: row.penaltyAmount / PENALTY_PER_DAY,
      ratePerDay: PENALTY_PER_DAY,
      amount: row.penaltyAmount,
      // Still counting while the contract runs; settled once it is over.
      ongoing: row.contractStatus === "active",
    },
  ];
}

function breakdownOf(row: RawInvoiceRow): InvoiceBreakdown {
  return {
    creatorName: row.name,
    fixed: { lines: rated(row, "fixed", row.fixedAmount, FIXED_RATE), total: row.fixedAmount },
    extra: { lines: rated(row, "extra", row.extraAmount, EXTRA_RATE), total: row.extraAmount },
    bonus: {
      lines: bonuses(row),
      total: row.bonusAmount ?? 0,
      performance: row.bonusAmount === null ? "waiting" : "ready",
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
