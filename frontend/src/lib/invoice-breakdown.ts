// The per-column breakdown popups of Rate & Invoicing (PBI-8, subtask 8.5): what each of the
// four money columns is made of, as the prototype's popups show it. This module holds the
// breakdown in the page's own names and turns one column of it into the lines its popup shows.
// It formats and words; it never recalculates, because the invoice's numbers are the server's.
//
// Pure module: no React and no next/headers, so the table, the popup and tests all share it.

import { formatDate, formatDeduction, formatRupiah } from "./format";

/** The columns that open a popup, in the table's order. */
export const BREAKDOWN_KINDS = ["fixed", "extra", "bonus", "penalty"] as const;

export type BreakdownKind = (typeof BREAKDOWN_KINDS)[number];

/** One extra content, counted at its own rate. */
export interface RatedLine {
  /** Null when the line cannot be traced to a content, which leaves its name as plain text. */
  contentId: string | null;
  name: string;
  rate: number;
  amount: number;
  /** Handed in after its deadline: listed so the missing fee is traced, at Rp0. */
  late?: boolean;
}

/**
 * The contract period the fixed rate pays for. The fixed rate is the contract's value for the
 * period, paid in full rather than per content; the quota says how far the period has come.
 */
export interface FixedPeriod {
  /** 1 for the first contract, counting up with every renewal. */
  number: number;
  /** Plain calendar days, "YYYY-MM-DD"; null when not known. */
  start: string | null;
  end: string | null;
  quotaDone: number;
  quotaTotal: number;
}

export type BonusPlatform = "instagram" | "tiktok";
export type BonusMetric = "views" | "likes" | "comments" | "shares";

/** The flat bonus of a Specific content handed in on time. */
export interface SpecificBonusLine {
  kind: "specific";
  contentId: string | null;
  name: string;
  amount: number;
}

/** The highest performance tier a content reached on one platform. */
export interface PerformanceBonusLine {
  kind: "performance";
  contentId: string | null;
  name: string;
  platform: BonusPlatform;
  metric: BonusMetric;
  /** What the content reached. */
  value: number;
  /** Which tier it earned, 1 for the lowest. */
  tier: number;
  amount: number;
}

export type BonusLine = SpecificBonusLine | PerformanceBonusLine;

/** One platform's tiers as the rate formula (8.1) sets them, in any order. */
export interface BonusTierRule {
  platform: BonusPlatform;
  metric: BonusMetric;
  steps: { min: number; bonus: number }[];
}

/** The rules the bonus popup states above its lines, so an admin can check a bonus by hand. */
export interface BonusRules {
  tiers: BonusTierRule[];
  /** Paid per Specific content handed in on time; 0 when not set. */
  specificBonus: number;
}

export interface PenaltyLine {
  contentId: string | null;
  name: string;
  daysLate: number;
  /** The days charged: no more than the cap per content, so at most daysLate. */
  chargedDays: number;
  ratePerDay: number;
  /** A positive amount; the popup writes it as taken away. */
  amount: number;
  /** True while the days still count: the content is not in and the cap is not reached. */
  ongoing: boolean;
}

/** One creator's running invoice, column by column, as the popups read it. */
export interface InvoiceBreakdown {
  creatorName: string;
  fixed: {
    period: FixedPeriod;
    total: number;
    /** True for a contract that has not started: nothing is billed yet. */
    notStarted: boolean;
  };
  extra: { lines: RatedLine[]; total: number };
  bonus: {
    lines: BonusLine[];
    total: number;
    /** "waiting" until performance data exists (PBI-19): the bonus is unknown, not zero. */
    performance: "waiting" | "ready";
    rules: BonusRules;
  };
  penalty: { lines: PenaltyLine[]; total: number };
}

export type BreakdownTone = "plain" | "danger";

export interface BreakdownPopupLine {
  /** Unique within the popup, for a list key. */
  key: string;
  contentId: string | null;
  name: string;
  /** How the amount came about, under the name. */
  detail: string;
  amount: string;
  tone: BreakdownTone;
}

export interface BreakdownPopupView {
  title: string;
  /** Lines stated above the list, such as the bonus tiers; null when there are none. */
  info: string[] | null;
  lines: BreakdownPopupLine[];
  /** Null when there is nothing to total. */
  total: string | null;
  /** What to say in place of the lines when there are none. */
  empty: string;
  /** A remark under the lines, or null. */
  note: string | null;
}

/** What the popup needs of a line before it is given its key. */
type Described = Omit<BreakdownPopupLine, "key">;

interface ColumnView {
  info: string[] | null;
  lines: Described[];
  total: number;
  empty: string;
  note: string | null;
}

/** How a money cell is named to a screen reader, after the table's own column headings. */
export const BREAKDOWN_LABELS: Record<BreakdownKind, string> = {
  fixed: "Fixed Rate",
  extra: "Konten Tambahan",
  bonus: "Bonus",
  penalty: "Penalti",
};

/** The popups' titles, worded as the prototype's. */
export const BREAKDOWN_TITLES: Record<BreakdownKind, string> = {
  fixed: "Fixed Rate Kontrak",
  extra: "Fee Konten Tambahan",
  bonus: "Bonus Performa",
  penalty: "Penalti",
};

const PLATFORM_LABELS: Record<BonusPlatform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
};

const METRIC_LABELS: Record<BonusMetric, string> = {
  views: "Views",
  likes: "Likes",
  comments: "Comments",
  shares: "Shares",
};

/** The performance bonus cannot be counted yet; saying so is not the same as saying zero. */
export const WAITING_FOR_DATA = "Menunggu data";

const COUNT_FORMAT = new Intl.NumberFormat("id-ID");

/** "1 Sep 2026 – 30 Nov 2026 · Kuota selesai 7/12": the dates only when the period has them. */
function periodDetail(period: FixedPeriod): string {
  const quota = `Kuota selesai ${period.quotaDone}/${period.quotaTotal}`;
  if (!period.start || !period.end) return quota;

  return `${formatDate(period.start)} – ${formatDate(period.end)} · ${quota}`;
}

function rated(line: RatedLine): Described {
  return {
    contentId: line.contentId,
    name: line.name,
    detail: line.late ? "Telat — tidak dibayar" : `1 konten × ${formatRupiah(line.rate)}`,
    amount: formatRupiah(line.amount),
    tone: "plain",
  };
}

function bonusDetail(line: BonusLine): string {
  if (line.kind === "specific") return "Bonus konten Specific tepat waktu";

  const reached = `${COUNT_FORMAT.format(line.value)} ${METRIC_LABELS[line.metric]}`;
  return `${PLATFORM_LABELS[line.platform]} · ${reached} · Tier ${line.tier}`;
}

function bonus(line: BonusLine): Described {
  return {
    contentId: line.contentId,
    name: line.name,
    detail: bonusDetail(line),
    amount: `+ ${formatRupiah(line.amount)}`,
    tone: "plain",
  };
}

/** The rule, then each platform's tiers lowest first, then the Specific bonus when it is set. */
function tierInfo(rules: BonusRules): string[] {
  // In the labels' order, not the rules': a frozen invoice's rules come back from jsonb reordered.
  const order = Object.keys(PLATFORM_LABELS);
  const platforms = rules.tiers
    .filter((rule) => rule.steps.length > 0)
    .toSorted((a, b) => order.indexOf(a.platform) - order.indexOf(b.platform))
    .map((rule) => {
      const steps = [...rule.steps]
        .sort((a, b) => a.min - b.min)
        .map((step, index) => `Tier ${index + 1}: ≥${COUNT_FORMAT.format(step.min)} → ${formatRupiah(step.bonus)}`)
        .join(" · ");
      return `${PLATFORM_LABELS[rule.platform]} (${METRIC_LABELS[rule.metric]}) — ${steps}`;
    });
  const specific =
    rules.specificBonus > 0
      ? [`Specific — ${formatRupiah(rules.specificBonus)} per konten Specific yang selesai tepat waktu`]
      : [];

  return ["Per konten, dipakai tier tertinggi yang tercapai.", ...platforms, ...specific];
}

function penalty(line: PenaltyLine): Described {
  const charged = line.chargedDays < line.daysLate ? ` · dihitung ${line.chargedDays} hari` : "";
  const counted = `Telat ${line.daysLate} hari${charged} × ${formatRupiah(line.ratePerDay)}`;

  return {
    contentId: line.contentId,
    name: line.name,
    detail: line.ongoing ? `${counted} · berjalan` : counted,
    amount: formatDeduction(line.amount),
    tone: "danger",
  };
}

// One reader per column (Open/Closed Principle): a fifth column is a fifth entry here and a
// title above; the popup and the function below stay as they are.
const COLUMNS: Record<BreakdownKind, (breakdown: InvoiceBreakdown) => ColumnView> = {
  // One line for the contract period, never a list of contents: the fixed rate pays the period.
  fixed: ({ fixed }) => ({
    info: null,
    lines:
      fixed.total > 0
        ? [
            {
              contentId: null,
              name: `Kontrak Periode ${fixed.period.number}`,
              detail: periodDetail(fixed.period),
              amount: formatRupiah(fixed.total),
              tone: "plain",
            },
          ]
        : [],
    total: fixed.total,
    empty: fixed.notStarted ? "Kontrak belum dimulai." : "Fixed rate kontrak belum diisi.",
    note: null,
  }),
  extra: ({ extra }) => ({
    info: null,
    lines: extra.lines.map(rated),
    total: extra.total,
    empty: "Belum ada konten tambahan yang selesai.",
    note: null,
  }),
  bonus: ({ bonus: column }) => ({
    info: tierInfo(column.rules),
    lines: column.lines.map(bonus),
    total: column.total,
    empty: "Belum ada konten yang mendapat bonus.",
    note: column.performance === "waiting" ? `Bonus performa: ${WAITING_FOR_DATA}` : null,
  }),
  penalty: ({ penalty: column }) => ({
    info: null,
    lines: column.lines.map(penalty),
    total: column.total,
    empty: "Tidak ada keterlambatan.",
    note: null,
  }),
};

/**
 * Keys the lines by their content, numbering a repeat: one content can earn two bonuses, and a
 * line without a content has only its name to go by.
 */
function keyed(lines: Described[]): BreakdownPopupLine[] {
  const seen = new Map<string, number>();

  return lines.map((line) => {
    const base = line.contentId ?? line.name;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);

    return { ...line, key: count === 0 ? base : `${base}-${count + 1}` };
  });
}

/**
 * One column of a creator's invoice as its popup shows it. The total is the invoice's own, so
 * the popup can never disagree with the table cell that opened it.
 */
export function breakdownPopup(kind: BreakdownKind, breakdown: InvoiceBreakdown): BreakdownPopupView {
  const column = COLUMNS[kind](breakdown);
  // A penalty is money taken away, and its total reads that way too.
  const total = kind === "penalty" ? formatDeduction(column.total) : formatRupiah(column.total);

  return {
    title: `${BREAKDOWN_TITLES[kind]} · ${breakdown.creatorName}`,
    info: column.info,
    lines: keyed(column.lines),
    total: column.lines.length === 0 ? null : total,
    empty: column.empty,
    note: column.note,
  };
}
