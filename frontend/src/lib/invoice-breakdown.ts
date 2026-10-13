// The per-column breakdown popups of Rate & Invoicing (PBI-8, subtask 8.5): what each of the
// four money columns is made of, content by content. This module holds the breakdown in the
// page's own names and turns one column of it into the lines its popup shows. It formats and
// words; it never recalculates, because the invoice's numbers are the server's.
//
// Pure module: no React and no next/headers, so the table, the popup and tests all share it.

import { formatRupiah } from "./format";

/** The columns that open a popup, in the table's order. */
export const BREAKDOWN_KINDS = ["fixed", "extra", "bonus", "penalty"] as const;

export type BreakdownKind = (typeof BREAKDOWN_KINDS)[number];

/** A content counted at a rate: one finished content of the quota, or one extra content. */
export interface RatedLine {
  /** Null when the line cannot be traced to a content, which leaves its name as plain text. */
  contentId: string | null;
  name: string;
  rate: number;
  amount: number;
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

/** A performance tier a content reached on one platform. */
export interface PerformanceBonusLine {
  kind: "performance";
  contentId: string | null;
  name: string;
  platform: BonusPlatform;
  metric: BonusMetric;
  /** What the content reached. */
  value: number;
  /** The least the tier asks for. */
  threshold: number;
  amount: number;
}

export type BonusLine = SpecificBonusLine | PerformanceBonusLine;

export interface PenaltyLine {
  contentId: string | null;
  name: string;
  daysLate: number;
  ratePerDay: number;
  /** A positive amount; the popup writes it as taken away. */
  amount: number;
  /** True while the content is still not handed in, so the days keep counting. */
  ongoing: boolean;
}

/** One creator's running invoice, column by column, as the popups read it. */
export interface InvoiceBreakdown {
  creatorName: string;
  fixed: { lines: RatedLine[]; total: number };
  extra: { lines: RatedLine[]; total: number };
  bonus: {
    lines: BonusLine[];
    total: number;
    /** "waiting" until performance data exists (PBI-19): the bonus is unknown, not zero. */
    performance: "waiting" | "ready";
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
  lines: Described[];
  total: number;
  note: string | null;
}

/** Worded as the prototype's popup titles. */
export const BREAKDOWN_LABELS: Record<BreakdownKind, string> = {
  fixed: "Fixed Rate",
  extra: "Konten Tambahan",
  bonus: "Bonus",
  penalty: "Penalti",
};

const EMPTY_MESSAGES: Record<BreakdownKind, string> = {
  fixed: "Belum ada konten yang selesai.",
  extra: "Belum ada konten tambahan yang selesai.",
  bonus: "Belum ada konten yang mendapat bonus.",
  penalty: "Tidak ada keterlambatan.",
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

function rated(line: RatedLine): Described {
  return {
    contentId: line.contentId,
    name: line.name,
    detail: `1 konten × ${formatRupiah(line.rate)}`,
    amount: formatRupiah(line.amount),
    tone: "plain",
  };
}

function bonusDetail(line: BonusLine): string {
  if (line.kind === "specific") return "Bonus konten Specific tepat waktu";

  const reached = `${COUNT_FORMAT.format(line.value)} ${METRIC_LABELS[line.metric]}`;
  return `${PLATFORM_LABELS[line.platform]} · ${reached} (min. ${COUNT_FORMAT.format(line.threshold)})`;
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

function penalty(line: PenaltyLine): Described {
  const counted = `Telat ${line.daysLate} hari × ${formatRupiah(line.ratePerDay)}`;

  return {
    contentId: line.contentId,
    name: line.name,
    detail: line.ongoing ? `${counted} · masih berjalan` : counted,
    amount: `− ${formatRupiah(line.amount)}`,
    tone: "danger",
  };
}

// One reader per column. A fifth column is a fifth entry here and a label above; the popup and
// the function below stay as they are.
const COLUMNS: Record<BreakdownKind, (breakdown: InvoiceBreakdown) => ColumnView> = {
  fixed: ({ fixed }) => ({ lines: fixed.lines.map(rated), total: fixed.total, note: null }),
  extra: ({ extra }) => ({ lines: extra.lines.map(rated), total: extra.total, note: null }),
  bonus: ({ bonus: column }) => ({
    lines: column.lines.map(bonus),
    total: column.total,
    note: column.performance === "waiting" ? `Bonus performa: ${WAITING_FOR_DATA}` : null,
  }),
  penalty: ({ penalty: column }) => ({
    lines: column.lines.map(penalty),
    total: column.total,
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
  const total = `${kind === "penalty" ? "− " : ""}${formatRupiah(column.total)}`;

  return {
    title: `${BREAKDOWN_LABELS[kind]} · ${breakdown.creatorName}`,
    lines: keyed(column.lines),
    total: column.lines.length === 0 ? null : total,
    empty: EMPTY_MESSAGES[kind],
    note: column.note,
  };
}
