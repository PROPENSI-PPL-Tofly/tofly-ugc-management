// Types and URL contract for the cross-creator Content Plan (PBI 5, subtask 5.2). The page
// lives in the URL: every tab, filter and page number is a parameter, so a view can be linked,
// bookmarked and reloaded. Pure module — no next/headers — so client components can share it.

import type { ContentType } from "./contents";
import type { ContentStatus, ContentTag } from "./creators";

export const CONTENT_PLAN_BASE = "/admin/content-plan";

/** The list shows ten rows a page, as the prototype and 5.1 agree. */
export const CONTENT_PLAN_PAGE_SIZE = 10;

export type ContentPlanTab = "all" | "action" | "waiting" | "done";

export interface ContentPlanTabDef {
  key: ContentPlanTab;
  label: string;
  /** Null is every status; otherwise the statuses that belong to this tab. */
  statuses: readonly ContentStatus[] | null;
  /** The tab holds what still needs a decision, so its counter turns red past zero. */
  urgent: boolean;
  /** The tab always shows its count, zero included. */
  counter: boolean;
}

/** The four tabs, grouped by whose ball it is: the admin's, the creator's, or nobody's. */
export const CONTENT_PLAN_TABS: readonly ContentPlanTabDef[] = [
  { key: "all", label: "Semua", statuses: null, urgent: false, counter: false },
  {
    key: "action",
    label: "Perlu Approval",
    statuses: ["pending", "draft_review"],
    urgent: true,
    counter: true,
  },
  {
    key: "waiting",
    label: "Menunggu Kreator",
    statuses: ["scheduled", "draft_revision", "draft_approved"],
    urgent: false,
    counter: true,
  },
  { key: "done", label: "Selesai", statuses: ["link_submitted"], urgent: false, counter: false },
];

export const CONTENT_PLAN_TAB_KEYS: readonly ContentPlanTab[] = [
  "all",
  "action",
  "waiting",
  "done",
];

export type OverdueFilter = "all" | "yes" | "no";
export type PeriodFilter = "all" | "month" | "next30" | "last90" | "custom";
export type DeadlineSort = "asc" | "desc";

/** Farthest deadline first, the way every tab opens in the prototype. */
export const DEFAULT_SORT: DeadlineSort = "desc";

const CONTENT_STATUSES: readonly ContentStatus[] = [
  "pending",
  "scheduled",
  "draft_review",
  "draft_revision",
  "draft_approved",
  "link_submitted",
];

const CONTENT_TYPES: readonly ContentType[] = ["evergreen", "specific"];

const OVERDUE_FILTERS: readonly OverdueFilter[] = ["all", "yes", "no"];
const PERIOD_FILTERS: readonly PeriodFilter[] = [
  "all",
  "month",
  "next30",
  "last90",
  "custom",
];
const SORT_DIRECTIONS: readonly DeadlineSort[] = ["asc", "desc"];

/** One tab's validated URL state. */
export interface ContentPlanParams {
  tab: ContentPlanTab;
  page: number;
  q: string;
  creator: string[];
  type: ContentType[];
  status: ContentStatus[];
  overdue: OverdueFilter;
  period: PeriodFilter;
  from: string;
  to: string;
  sort: DeadlineSort;
}

export const DEFAULT_CONTENT_PLAN_PARAMS: ContentPlanParams = {
  tab: "all",
  page: 1,
  q: "",
  creator: [],
  type: [],
  status: [],
  overdue: "all",
  period: "all",
  from: "",
  to: "",
  sort: DEFAULT_SORT,
};

/** What each tab says when it holds nothing. */
export const CONTENT_PLAN_EMPTY: Record<ContentPlanTab, string> = {
  all: "Belum ada konten.",
  action: "Tidak ada yang perlu di-approve.",
  waiting: "Tidak ada konten yang menunggu kreator.",
  done: "Belum ada konten selesai.",
};

/** What a filtered-but-empty list says, whatever the tab. */
export const CONTENT_PLAN_FILTERED_EMPTY =
  "Tidak ada konten sesuai filter.";

export function tabDef(tab: ContentPlanTab): ContentPlanTabDef {
  return CONTENT_PLAN_TABS.find((candidate) => candidate.key === tab) ?? CONTENT_PLAN_TABS[0];
}

export function statusInTab(tab: ContentPlanTab, status: ContentStatus): boolean {
  const def = tabDef(tab);
  return def.statuses === null || def.statuses.includes(status);
}

/** Whether a row in this status gets the review button rather than the quiet detail one. */
export function needsReview(status: ContentStatus): boolean {
  return statusInTab("action", status);
}

/** The statuses the status filter offers on this tab. */
export function statusOptionsFor(tab: ContentPlanTab): readonly ContentStatus[] {
  return tabDef(tab).statuses ?? CONTENT_STATUSES;
}

/** A search parameter can arrive repeated; the first value is the one the UI set. */
function single(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/** A comma-separated multi-select, trimmed and emptied of blanks. */
function list(value: string | string[] | undefined): string[] {
  return single(value)
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

function oneOf<T extends string>(values: readonly T[], raw: string, fallback: T): T {
  return (values as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The URL's values as the page's state, every one checked. Anything the page cannot hold —
 * an unknown tab, a status from another world, a page of zero — falls back to the default
 * rather than reaching the API, which would only answer with a 400.
 */
export function parseContentPlanParams(
  params: Record<string, string | string[] | undefined>,
): ContentPlanParams {
  const rawPage = single(params.page);

  return {
    tab: oneOf(CONTENT_PLAN_TAB_KEYS, single(params.tab), "all"),
    page: /^[1-9]\d*$/.test(rawPage) ? Number(rawPage) : 1,
    q: single(params.q).trim(),
    creator: list(params.creator),
    type: list(params.type).filter((value): value is ContentType =>
      (CONTENT_TYPES as readonly string[]).includes(value),
    ),
    status: list(params.status).filter((value): value is ContentStatus =>
      (CONTENT_STATUSES as readonly string[]).includes(value),
    ),
    overdue: oneOf(OVERDUE_FILTERS, single(params.overdue), "all"),
    period: oneOf(PERIOD_FILTERS, single(params.period), "all"),
    from: CALENDAR_DAY.test(single(params.from)) ? single(params.from) : "",
    to: CALENDAR_DAY.test(single(params.to)) ? single(params.to) : "",
    sort: oneOf(SORT_DIRECTIONS, single(params.sort), DEFAULT_SORT),
  };
}

/**
 * The non-default parts of the state as query parameters, in a stable order. Defaults are
 * left out so the bare view stays at the bare address and every extra is worth its characters.
 */
export function buildContentPlanQuery(state: ContentPlanParams): Record<string, string> {
  const query: Record<string, string> = {};
  if (state.tab !== "all") query.tab = state.tab;
  if (state.q) query.q = state.q;
  if (state.creator.length > 0) query.creator = state.creator.join(",");
  if (state.type.length > 0) query.type = state.type.join(",");
  if (state.status.length > 0) query.status = state.status.join(",");
  if (state.overdue !== "all") query.overdue = state.overdue;
  if (state.period !== "all") query.period = state.period;
  if (state.from) query.from = state.from;
  if (state.to) query.to = state.to;
  if (state.sort !== DEFAULT_SORT) query.sort = state.sort;
  if (state.page > 1) query.page = String(state.page);
  return query;
}

/** The page's own address for a state: the bare path, or the path with its query. */
export function contentPlanHref(state: ContentPlanParams): string {
  const search = new URLSearchParams(buildContentPlanQuery(state)).toString();
  return search ? `${CONTENT_PLAN_BASE}?${search}` : CONTENT_PLAN_BASE;
}

/** Whether a search or filter narrowed the view, which changes what an empty list means. */
export function isFiltered(state: ContentPlanParams): boolean {
  return (
    state.q !== "" ||
    state.creator.length > 0 ||
    state.type.length > 0 ||
    state.status.length > 0 ||
    state.overdue !== "all" ||
    state.period !== "all"
  );
}

/** A filter change: the patch applies and the old page number no longer means anything. */
export function contentPlanAfterFilterChange(
  state: ContentPlanParams,
  patch: Partial<ContentPlanParams>,
): ContentPlanParams {
  return { ...state, ...patch, page: 1 };
}

/**
 * A tab change: the search and the filters carry over, but the status picks, the sort
 * direction and the page belong to the tab that was left behind.
 */
export function contentPlanAfterTabChange(
  state: ContentPlanParams,
  tab: ContentPlanTab,
): ContentPlanParams {
  return { ...state, tab, status: [], sort: DEFAULT_SORT, page: 1 };
}

export interface ContentPlanRow {
  contentId: string;
  name: string;
  creatorId: string;
  creatorName: string;
  type: ContentType;
  deadline: string;
  status: ContentStatus;
  tags: ContentTag[];
  revisionCount: number;
}

export interface ContentPlanCounts {
  all: number;
  action: number;
  waiting: number;
  done: number;
}

export interface ContentPlanResponse {
  items: ContentPlanRow[];
  total: number;
  totalPages: number;
  counts: ContentPlanCounts;
}

/** The creator filter's options: every name an admin can pick, however the rows are paged. */
export interface ContentPlanCreatorOption {
  id: string;
  name: string;
}
