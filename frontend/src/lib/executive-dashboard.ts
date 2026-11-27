// The admin's executive Dashboard (PBI-24): the page's URL state, GET /admin/dashboard's
// monthly series and creator rows, the three charts' bars and the Performa Creator order. Pure
// module — no fetch, no clock — so the page, its charts and its table share one vocabulary and
// the tests pin the wire shape without a server. reshapeExecutiveAnswer turns 24.1's answer into
// the shape these checks and 24.2's KPI checks read; the KPI figures themselves are 24.2's.

import { oneOf, single, type SearchParams } from "./search-params";

/** The page's address and the endpoint it reads. */
export const EXECUTIVE_DASHBOARD_BASE = "/admin/dashboard";
export const EXECUTIVE_DASHBOARD_PATH = "/admin/dashboard";

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

/** The parts of GET /admin/dashboard the charts and the table read. */
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
  return new URLSearchParams({ range: String(state.months) });
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

/** "2026-12" → "2027-01": the calendar month after a "YYYY-MM" label. */
function nextMonth(label: string): string {
  const [year, month] = label.split("-").map(Number);
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
}

/**
 * Exactly `count` months, each the calendar month after the one before. The range's last month
 * is the backend's to say (this module has no clock), but a dropped or extra month is caught.
 */
export function coversRange(months: readonly MonthSeries[], count: number): boolean {
  return (
    months.length === count &&
    months.every((entry, index) => index === 0 || nextMonth(months[index - 1].month) === entry.month)
  );
}

/**
 * GET /admin/dashboard's answer, reshaped, as the charts and the table read it. A 200 the page cannot
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

/** Each chart of 24.1's answer, by its key there, and its parts' keys there by the field here. */
const CHART_FIELDS = {
  spending: { chart: "spending", parts: { fixedRate: "fixedRate", additionalContent: "additionalContent", performanceBonus: "performanceBonus" } },
  views: { chart: "views", parts: { instagram: "instagram", tiktok: "tiktok" } },
  delivery: { chart: "timeliness", parts: { onTime: "on_time", late: "late", notSent: "not_sent" } },
} as const;

/** The KPI cards' keys (24.2) for 24.1's card keys. */
const KPI_FIELDS = {
  totalSpending: "totalSpending",
  unpaid: "unpaidAmount",
  totalViews: "totalViews",
  costPer1000Views: "costPer1000Views",
  onTimeRate: "onTimeRate",
  engagementRate: "engagementRate",
} as const;

/** One chart's months as month → (part key → value), in the order the answer gave them. */
function chartMonths(charts: readonly unknown[], key: string): Map<string, Record<string, unknown>> {
  const chart = charts.find((entry) => isRecord(entry) && entry.key === key);
  const months = new Map<string, Record<string, unknown>>();
  if (!isRecord(chart) || !Array.isArray(chart.months)) return months;
  for (const entry of chart.months) {
    if (!isRecord(entry) || typeof entry.month !== "string" || !Array.isArray(entry.parts)) continue;
    months.set(entry.month, Object.fromEntries(entry.parts.filter(isRecord).map((part) => [String(part.key), part.value])));
  }
  return months;
}

function pick(values: Record<string, unknown> | undefined, fields: Readonly<Record<string, string>>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([field, key]) => [field, values?.[key]]));
}

function creatorFields(row: unknown): unknown {
  if (!isRecord(row)) return row;
  return {
    creatorId: row.creatorId,
    creatorName: row.name,
    spending: row.spending,
    contentSent: row.sent,
    contentQuota: row.quota,
    onTimeRate: row.onTimeRate,
    views: row.views,
    costPer1000Views: row.costPer1000Views,
  };
}

/** Both ranges' figures for the KPI cards; a card the answer left out stays out, so only it fails. */
function kpiBlock(cards: unknown, missingViewLinks: unknown): unknown {
  if (!Array.isArray(cards)) return undefined;
  const current: Record<string, unknown> = {};
  const previous: Record<string, unknown> = {};
  for (const card of cards) {
    if (!isRecord(card) || typeof card.key !== "string" || !Object.hasOwn(KPI_FIELDS, card.key)) continue;
    const field = KPI_FIELDS[card.key as keyof typeof KPI_FIELDS];
    current[field] = card.value;
    previous[field] = card.previous;
  }
  current.linksAwaitingData = missingViewLinks;
  return { current, previous };
}

/** "Jun 2026" for the first and last month of the answer's range, or null when it has none. */
function periodOf(range: unknown): { from: string; to: string } | null {
  if (!isRecord(range) || typeof range.from !== "string" || typeof range.to !== "string") return null;
  const from = range.from.slice(0, 7);
  const to = range.to.slice(0, 7);
  return MONTH.test(from) && MONTH.test(to) ? { from: monthLabel(from), to: monthLabel(to) } : null;
}

/**
 * GET /admin/dashboard (24.1) in the shapes this page's checks read: `charts` for
 * toExecutiveDashboard, `kpis` for 24.2's toExecutiveKpis, and the months shown for the header.
 * It only moves fields; it never fills a gap, so anything missing or malformed still fails the
 * check that reads it (OWASP A08). The spending chart's months are the axis; a month another
 * chart lacks leaves its figures undefined, which fails the whole answer.
 */
export function reshapeExecutiveAnswer(body: unknown): { charts: unknown; kpis: unknown; period: { from: string; to: string } | null } {
  if (!isRecord(body)) return { charts: undefined, kpis: undefined, period: null };
  const charts = Array.isArray(body.charts) ? body.charts : [];
  const spending = chartMonths(charts, CHART_FIELDS.spending.chart);
  const views = chartMonths(charts, CHART_FIELDS.views.chart);
  const delivery = chartMonths(charts, CHART_FIELDS.delivery.chart);

  return {
    charts: {
      months: Array.isArray(body.charts)
        ? [...spending.keys()].map((month) => ({
            month,
            spending: pick(spending.get(month), CHART_FIELDS.spending.parts),
            views: pick(views.get(month), CHART_FIELDS.views.parts),
            delivery: pick(delivery.get(month), CHART_FIELDS.delivery.parts),
          }))
        : body.charts,
      creators: Array.isArray(body.creators) ? body.creators.map(creatorFields) : body.creators,
    },
    kpis: kpiBlock(body.kpis, body.missingViewLinks),
    period: periodOf(body.range),
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
