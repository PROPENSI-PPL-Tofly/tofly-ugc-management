// The admin's executive Dashboard (PBI-24): the page's URL state, GET /dashboard/executive's
// monthly series and creator rows, the three charts' bars and the Performa Creator order. Pure
// module — no fetch, no clock — so the page, its charts and its table share one vocabulary and
// the tests pin the wire shape without a server. The answer's shape is the one 24.3 asks 24.1
// to write; the KPI part of it is 24.2's and is not read here.

import { oneOf, single, type SearchParams } from "./search-params";

/** The page's address and the endpoint it reads. */
export const EXECUTIVE_DASHBOARD_BASE = "/admin/dashboard";
export const EXECUTIVE_DASHBOARD_PATH = "/dashboard/executive";

/** AC Range: 3, 6 or 12 months ending this month, 6 by default. */
export const RANGE_MONTHS = [3, 6, 12] as const;
export type RangeMonths = (typeof RANGE_MONTHS)[number];

/** Performa Creator's columns, in the order the table shows them. */
export const CREATOR_SORT_KEYS = ["name", "spending", "content", "onTime", "views", "costPer1000"] as const;
export type CreatorSortKey = (typeof CREATOR_SORT_KEYS)[number];
export type SortOrder = "asc" | "desc";

/** The page's state as it lives in the URL: the range and the table's order. */
export interface DashboardState {
  months: RangeMonths;
  sort: CreatorSortKey;
  order: SortOrder;
}

/** AC Range and AC Creators: six months, the creators by views from high to low. */
export const DEFAULT_DASHBOARD_STATE: Readonly<DashboardState> = { months: 6, sort: "views", order: "desc" };

/** One month's bars: spending by component, views by platform, content due by outcome. */
export interface MonthSeries {
  /** "2026-09". */
  month: string;
  spending: { fixedRate: number; additionalContent: number; performanceBonus: number };
  views: { instagram: number; tiktok: number };
  delivery: { onTime: number; late: number; notSent: number };
}

/** One row of Performa Creator: a creator with a contract in the range (AC Creators). */
export interface CreatorPerformance {
  creatorId: string;
  creatorName: string;
  /** Rupiah from the creator's invoices finalized in the range. */
  spending: number;
  contentSent: number;
  contentQuota: number;
  /** Percent, 0–100; null while nothing was due. */
  onTimeRate: number | null;
  /** Null while none of the creator's links has numbers yet (AC Data rules), never 0. */
  views: number | null;
  /** Rupiah; null while there are no views to divide by. */
  costPer1000Views: number | null;
}

/** The parts of GET /dashboard/executive the charts and the table read. */
export interface ExecutiveDashboard {
  months: MonthSeries[];
  creators: CreatorPerformance[];
}

/** A load of the dashboard that failed, with the backend's status (502 for an unusable 200). */
export class ExecutiveDashboardError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Loading the executive dashboard failed with HTTP ${status}`);
    this.name = "ExecutiveDashboardError";
    this.status = status;
  }
}

/** The URL's values as the page's state, every one checked; anything else is its default. */
export function parseDashboardParams(params: SearchParams): DashboardState {
  const range = Number(oneOf(RANGE_MONTHS.map(String), single(params.range), String(DEFAULT_DASHBOARD_STATE.months)));

  return {
    months: range as RangeMonths,
    sort: oneOf(CREATOR_SORT_KEYS, single(params.sort), DEFAULT_DASHBOARD_STATE.sort),
    order: oneOf(["asc", "desc"] as const, single(params.order), DEFAULT_DASHBOARD_STATE.order),
  };
}

/** The non-default parts of the state as query parameters; the bare page stays at the bare path. */
export function buildDashboardQuery(state: DashboardState): Record<string, string> {
  const query: Record<string, string> = {};
  if (state.months !== DEFAULT_DASHBOARD_STATE.months) query.range = String(state.months);
  if (state.sort !== DEFAULT_DASHBOARD_STATE.sort || state.order !== DEFAULT_DASHBOARD_STATE.order) {
    query.sort = state.sort;
    query.order = state.order;
  }
  return query;
}

/** The page's own address for a state. */
export function dashboardHref(state: DashboardState): string {
  const search = new URLSearchParams(buildDashboardQuery(state)).toString();
  return search ? `${EXECUTIVE_DASHBOARD_BASE}?${search}` : EXECUTIVE_DASHBOARD_BASE;
}

/**
 * What the endpoint is asked: the range alone, as the page parsed it. The table sorts the rows
 * it already has, so its order never travels (OWASP A03: only checked values reach the API).
 */
export function toDashboardApiQuery(state: DashboardState): URLSearchParams {
  return new URLSearchParams({ months: String(state.months) });
}

const UNUSABLE_ANSWER = 502;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** A whole count or Rupiah amount, never below zero: a negative part would break a stacked bar. */
function isAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function hasAmounts(value: unknown, keys: readonly string[]): boolean {
  return isRecord(value) && keys.every((key) => isAmount(value[key]));
}

function isMonthSeries(value: unknown): value is MonthSeries {
  return (
    isRecord(value) &&
    typeof value.month === "string" &&
    MONTH.test(value.month) &&
    hasAmounts(value.spending, ["fixedRate", "additionalContent", "performanceBonus"]) &&
    hasAmounts(value.views, ["instagram", "tiktok"]) &&
    hasAmounts(value.delivery, ["onTime", "late", "notSent"])
  );
}

function isNullableShare(value: unknown): boolean {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100);
}

function isNullableMoney(value: unknown): boolean {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

function isCreatorPerformance(value: unknown): value is CreatorPerformance {
  return (
    isRecord(value) &&
    typeof value.creatorId === "string" &&
    typeof value.creatorName === "string" &&
    isAmount(value.spending) &&
    isAmount(value.contentSent) &&
    isAmount(value.contentQuota) &&
    isNullableShare(value.onTimeRate) &&
    (value.views === null || isAmount(value.views)) &&
    isNullableMoney(value.costPer1000Views)
  );
}

/** Oldest first and each month once, so the bars read left to right as time. */
function inOrder(months: readonly MonthSeries[]): boolean {
  return months.every((entry, index) => index === 0 || months[index - 1].month < entry.month);
}

/**
 * GET /dashboard/executive's answer as the charts and the table read it. A 200 the page cannot
 * use is a failure, never an empty dashboard: a chart that silently dropped a malformed month
 * would show a gap and hide the drift (OWASP A08: data from another system is checked before it
 * is trusted). Only the fields named here are kept.
 */
export function toExecutiveDashboard(body: unknown): ExecutiveDashboard {
  if (!isRecord(body) || !Array.isArray(body.months) || !Array.isArray(body.creators)) {
    throw new ExecutiveDashboardError(UNUSABLE_ANSWER);
  }

  const { months, creators } = body;
  if (!months.every(isMonthSeries) || !inOrder(months) || !creators.every(isCreatorPerformance)) {
    throw new ExecutiveDashboardError(UNUSABLE_ANSWER);
  }

  return {
    months: months.map(({ month, spending, views, delivery }) => ({
      month,
      spending: {
        fixedRate: spending.fixedRate,
        additionalContent: spending.additionalContent,
        performanceBonus: spending.performanceBonus,
      },
      views: { instagram: views.instagram, tiktok: views.tiktok },
      delivery: { onTime: delivery.onTime, late: delivery.late, notSent: delivery.notSent },
    })),
    creators: creators.map((creator) => ({
      creatorId: creator.creatorId,
      creatorName: creator.creatorName,
      spending: creator.spending,
      contentSent: creator.contentSent,
      contentQuota: creator.contentQuota,
      onTimeRate: creator.onTimeRate,
      views: creator.views,
      costPer1000Views: creator.costPer1000Views,
    })),
  };
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** "Sep 2026" for "2026-09", the way the rest of the interface abbreviates months. */
export function monthLabel(month: string): string {
  const [year, index] = month.split("-");
  return `${MONTH_NAMES[Number(index) - 1]} ${year}`;
}

/** One stacked bar: its month, its parts by key, and their total for the tooltip and the table. */
export interface ChartRow<K extends string = string> {
  month: string;
  label: string;
  values: Record<K, number>;
  total: number;
}

/** One part of a stacked bar: its key in the row, its name in the legend, and its colour. */
export interface ChartSegment<K extends string = string> {
  key: K;
  label: string;
  color: string;
}

function rowsOf<K extends string>(
  months: readonly MonthSeries[],
  pick: (month: MonthSeries) => Record<K, number>,
): ChartRow<K>[] {
  return months.map((entry) => {
    const values = pick(entry);
    const total = (Object.values(values) as number[]).reduce((sum, part) => sum + part, 0);
    return { month: entry.month, label: monthLabel(entry.month), values: { ...values }, total };
  });
}

export type SpendingKey = keyof MonthSeries["spending"];
export type ViewsKey = keyof MonthSeries["views"];
export type DeliveryKey = keyof MonthSeries["delivery"];

/**
 * The charts' parts, bottom of the stack first. Colours are the theme's tokens, so the bars follow
 * the interface's palette; Ketepatan Pengiriman uses the status colours the rest of the app gives
 * on time, late and missing.
 */
export const SPENDING_SEGMENTS: readonly ChartSegment<SpendingKey>[] = [
  { key: "fixedRate", label: "Fixed Rate", color: "var(--color-accent)" },
  { key: "additionalContent", label: "Konten Tambahan", color: "var(--color-amber)" },
  { key: "performanceBonus", label: "Bonus Performa", color: "var(--color-green)" },
];

export const VIEWS_SEGMENTS: readonly ChartSegment<ViewsKey>[] = [
  { key: "instagram", label: "Instagram", color: "var(--color-accent)" },
  { key: "tiktok", label: "TikTok", color: "var(--color-ink-2)" },
];

export const DELIVERY_SEGMENTS: readonly ChartSegment<DeliveryKey>[] = [
  { key: "onTime", label: "Tepat Waktu", color: "var(--color-green)" },
  { key: "late", label: "Terlambat", color: "var(--color-amber)" },
  { key: "notSent", label: "Belum Dikirim", color: "var(--color-red)" },
];

/** Spending per Bulan: Fixed Rate, Konten Tambahan and Bonus Performa per month (AC Charts). */
export function spendingRows(months: readonly MonthSeries[]): ChartRow<SpendingKey>[] {
  return rowsOf(months, ({ spending }) => spending);
}

/** Views per Bulan: Instagram and TikTok per month. */
export function viewsRows(months: readonly MonthSeries[]): ChartRow<ViewsKey>[] {
  return rowsOf(months, ({ views }) => views);
}

/** Ketepatan Pengiriman: content due per month by Tepat Waktu, Terlambat and Belum Dikirim. */
export function deliveryRows(months: readonly MonthSeries[]): ChartRow<DeliveryKey>[] {
  return rowsOf(months, ({ delivery }) => delivery);
}

/** Nothing to stack in any month: the chart shows its empty state instead of an empty axis. */
export function isEmptyChart(rows: readonly ChartRow[]): boolean {
  return rows.every(({ total }) => total === 0);
}

/** Each column's value for sorting; null is no data and always sorts last. */
const SORT_VALUE: Record<Exclude<CreatorSortKey, "name">, (row: CreatorPerformance) => number | null> = {
  spending: (row) => row.spending,
  content: (row) => (row.contentQuota === 0 ? null : row.contentSent / row.contentQuota),
  onTime: (row) => row.onTimeRate,
  views: (row) => row.views,
  costPer1000: (row) => row.costPer1000Views,
};

const NAME_ORDER = new Intl.Collator("id-ID", { sensitivity: "base" });

/**
 * Performa Creator in the chosen order, as a new array. A creator with no data in the column
 * goes last whichever way it runs, so "no views yet" never reads as the lowest; ties fall back
 * to the name, so the order never jumps between loads.
 */
export function sortCreators(
  rows: readonly CreatorPerformance[],
  sort: CreatorSortKey,
  order: SortOrder,
): CreatorPerformance[] {
  const flip = order === "asc" ? 1 : -1;
  const byName = (a: CreatorPerformance, b: CreatorPerformance) => NAME_ORDER.compare(a.creatorName, b.creatorName);

  if (sort === "name") return [...rows].sort((a, b) => flip * byName(a, b));

  const value = SORT_VALUE[sort];
  return [...rows].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    if (left === null || right === null) {
      if (left === right) return byName(a, b);
      return left === null ? 1 : -1;
    }
    return left === right ? byName(a, b) : flip * (left - right);
  });
}

/**
 * The order after a press on a header: the same column turns over, another one starts from its
 * natural direction (names A to Z, numbers high to low).
 */
export function nextCreatorSort(
  current: Readonly<{ sort: CreatorSortKey; order: SortOrder }>,
  key: CreatorSortKey,
): { sort: CreatorSortKey; order: SortOrder } {
  if (current.sort === key) return { sort: key, order: current.order === "asc" ? "desc" : "asc" };
  return { sort: key, order: key === "name" ? "asc" : "desc" };
}
