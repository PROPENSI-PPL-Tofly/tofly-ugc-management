// How each of the dashboard's six KPI cards presents its figure (PBI-24.2): GoF Strategy.
//
// A card is one component for all six KPIs. What differs between them — how the figure is
// written, what its tooltip explains, how a change from the previous range is measured
// (relative percent or percentage points) and whether a rise is good, bad or neutral — is
// handed to the card as a KpiStrategy, so the card never asks which KPI it is drawing. A new
// KPI is one more entry here, and each strategy is tested on its own.
//
// Labels, formats, formulas and polarities follow the approved design (Tofly Sprint 4
// Prototype, PBI-24) and the PO's decisions of 2026-11-26.

import type { ExecutiveKpis, KpiKey, KpiValue } from "./executive-kpis";
import {
  formatChangeAmount,
  formatCountShort,
  formatKpiPercent,
  formatRupiahRounded,
  formatRupiahShort,
} from "./executive-kpi-format";
import { formatRupiah } from "./format";

export type Direction = "up" | "down" | "flat";
export type Tone = "good" | "bad" | "flat";

/** How a change from the previous range is measured, and the unit it is written in. */
export interface ChangeMeasure {
  unit: "%" | " pp";
  measure(current: number, previous: number): number;
}

/** Spending, views and costs: the change as a percent of the previous value. */
export const RELATIVE: ChangeMeasure = {
  unit: "%",
  measure: (current, previous) => ((current - previous) / previous) * 100,
};

/** Rates on the 0–100 scale: the difference in percentage points. */
export const POINTS: ChangeMeasure = {
  unit: " pp",
  measure: (current, previous) => current - previous,
};

/** Whether a move is good news for this KPI. */
export interface Polarity {
  judge(direction: Direction): Tone;
}

/** More spending is not bad by itself, nor less spending good. */
export const NEUTRAL: Polarity = { judge: () => "flat" };

/** A polarity that calls one direction good and the other bad; no move is neither. */
function favouring(good: Exclude<Direction, "flat">): Polarity {
  return {
    judge(direction) {
      if (direction === "flat") return "flat";
      return direction === good ? "good" : "bad";
    },
  };
}

export const HIGHER_IS_BETTER: Polarity = favouring("up");

export const LOWER_IS_BETTER: Polarity = favouring("down");

export interface KpiStrategy {
  key: KpiKey;
  label: string;
  format(value: number): string;
  change: ChangeMeasure;
  polarity: Polarity;
  /** The tooltip: the KPI's formula, after the full value where the card shows it short. */
  tip(current: KpiValue): string;
  /** A line under the comparison, for the one KPI that has one; null when it cannot be said. */
  note?(kpis: ExecutiveKpis): string | null;
}

/** A tooltip that leads with the full Rupiah value, since the card writes it short. */
function withFullValue(formula: string): KpiStrategy["tip"] {
  return (current) =>
    current === null
      ? formula
      : `Nilai penuh ${formatRupiah(Math.round(current))}. ${formula}`;
}

const formulaOnly =
  (formula: string): KpiStrategy["tip"] =>
  () =>
    formula;

export const KPI_STRATEGIES: readonly KpiStrategy[] = [
  {
    key: "totalSpending",
    label: "Total Spending",
    format: formatRupiahShort,
    change: RELATIVE,
    polarity: NEUTRAL,
    tip: withFullValue(
      "Total invoice yang difinalisasi di rentang ini. Invoice Cancelled tidak dihitung.",
    ),
  },
  {
    key: "unpaidAmount",
    label: "Belum Dibayar",
    format: formatRupiahShort,
    change: RELATIVE,
    polarity: LOWER_IS_BETTER,
    tip: withFullValue("Bagian Total Spending yang belum Paid."),
  },
  {
    key: "totalViews",
    label: "Total Views",
    format: formatCountShort,
    change: RELATIVE,
    polarity: HIGHER_IS_BETTER,
    tip: formulaOnly(
      "Views Instagram + TikTok dari link yang dikirim di rentang ini (tersinkron atau diisi manual).",
    ),
    note: ({ linksAwaitingData }) =>
      linksAwaitingData === null
        ? null
        : `${linksAwaitingData} link belum ada data`,
  },
  {
    key: "costPer1000Views",
    label: "Biaya per 1.000 Views",
    format: formatRupiahRounded,
    change: RELATIVE,
    polarity: LOWER_IS_BETTER,
    tip: formulaOnly("Total Spending ÷ Total Views × 1.000."),
  },
  {
    key: "onTimeRate",
    label: "On-time Rate",
    format: formatKpiPercent(1),
    change: POINTS,
    polarity: HIGHER_IS_BETTER,
    tip: formulaOnly(
      "Konten yang dikirim sampai deadline ÷ konten yang jatuh tempo di rentang ini.",
    ),
  },
  {
    key: "engagementRate",
    label: "Engagement Rate",
    format: formatKpiPercent(2),
    change: POINTS,
    polarity: HIGHER_IS_BETTER,
    tip: formulaOnly("(Likes + komentar + share) ÷ views."),
  },
];

export type Trend =
  | { kind: "none" }
  /** The previous range had 0: there is no percent of nothing, so the old value is named. */
  | { kind: "fromZero"; direction: "up" | "flat"; previousText: string }
  | { kind: "change"; direction: Direction; tone: Tone; text: string };

/** A change this small, in either unit, reads as no change, as in the design. */
const FLAT_BAND = 0.05;

/** How a KPI moved against the previous range of equal length, as its card says it. */
export function describeTrend(
  strategy: KpiStrategy,
  { current, previous }: { current: KpiValue; previous: KpiValue },
): Trend {
  if (current === null || previous === null) return { kind: "none" };

  // Checked before measuring, so a relative change never divides by zero (OWASP A10).
  if (previous === 0) {
    return {
      kind: "fromZero",
      direction: current > 0 ? "up" : "flat",
      previousText: strategy.format(0),
    };
  }

  const change = strategy.change.measure(current, previous);
  let direction: Direction = "flat";
  if (change > FLAT_BAND) direction = "up";
  else if (change < -FLAT_BAND) direction = "down";

  return {
    kind: "change",
    direction,
    tone: strategy.polarity.judge(direction),
    text: `${formatChangeAmount(change)}${strategy.change.unit}`,
  };
}
