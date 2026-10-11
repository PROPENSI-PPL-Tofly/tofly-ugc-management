// Everything the Task Saya page knows about GET /me/contents: the shape it answers with, and
// the page's URL contract. The page lives in the URL like the admin Content Plan does: the tab,
// every filter, the sort and the page number are parameters, so a view can be linked,
// bookmarked and reloaded. Pure module — no next/headers — so client components can share it.
//
// The backend orders, counts and pages the rows and decides which buttons each row allows
// today, H-1 grace window included. The table renders `actions` as given instead of
// re-deriving the rules, so the list can never offer a submit the draft/video endpoints would
// refuse.

import type { StatusTabDef } from "@/components/ui/status-tabs";
import { CONTENT_STATUS_LABELS } from "./content-labels";
import type { DeadlineSort, OverdueFilter } from "./content-plan";
import type { ContentType } from "./contents";
import type { ContentStatus, ContentTag } from "./creators";
import type { PeriodFilter } from "./deadline-period";
import {
  calendarDay,
  list,
  listOf,
  oneOf,
  pageNumber,
  single,
  type SearchParams,
} from "./search-params";

export const MY_TASKS_BASE = "/creator/tasks";

/** Task Saya shows ten tasks a page, the same as the admin Content Plan. */
export const MY_TASKS_PAGE_SIZE = 10;

/**
 * The statuses a creator can see, matching GET /me/contents?status. Pending is not one of them:
 * a proposal is not assigned work until an admin accepts it.
 */
export const TASK_STATUS_FILTERS = [
  "scheduled",
  "draft_review",
  "draft_revision",
  "draft_approved",
  "link_submitted",
] as const;

export type TaskStatusFilter = (typeof TASK_STATUS_FILTERS)[number];

/** How a status reads on Task Saya: the same label the admin sees. */
export function taskStatusLabel(status: ContentStatus): string {
  return CONTENT_STATUS_LABELS[status];
}

export type MyTaskTab = "all" | "action" | "waiting" | "done";

export interface MyTaskTabDef extends StatusTabDef<MyTaskTab> {
  /** Null is every status; otherwise the statuses that belong to this tab. */
  statuses: readonly TaskStatusFilter[] | null;
}

/**
 * The four tabs, grouped by whose turn it is: the creator's (Perlu Dikerjakan, whose counter
 * turns red), the admin's, or nobody's. The backend groups them the same way
 * (my-task-query.ts), read off the admin's own tabs.
 */
export const MY_TASK_TABS: readonly MyTaskTabDef[] = [
  { key: "all", label: "Semua", statuses: null, urgent: false, counter: false },
  {
    key: "action",
    label: "Perlu Dikerjakan",
    statuses: ["scheduled", "draft_revision", "draft_approved"],
    urgent: true,
    counter: true,
  },
  { key: "waiting", label: "Menunggu Admin", statuses: ["draft_review"], urgent: false, counter: true },
  { key: "done", label: "Selesai", statuses: ["link_submitted"], urgent: false, counter: false },
];

const MY_TASK_TAB_KEYS: readonly MyTaskTab[] = ["all", "action", "waiting", "done"];

/** The tab the period filter never narrows, so no work to do hides behind a date range. */
export const PERIOD_FREE_MY_TAB: MyTaskTab = "action";

/** The nearest deadline first: what a creator has to deliver next. */
export const DEFAULT_MY_TASKS_SORT: DeadlineSort = "asc";

const CONTENT_TYPES: readonly ContentType[] = ["evergreen", "specific"];
const OVERDUE_FILTERS: readonly OverdueFilter[] = ["all", "yes", "no"];
const PERIOD_FILTERS: readonly PeriodFilter[] = ["all", "month", "next30", "last90", "custom"];
const SORT_DIRECTIONS: readonly DeadlineSort[] = ["asc", "desc"];

/** What each tab says when it holds nothing. */
export const MY_TASKS_EMPTY: Record<MyTaskTab, string> = {
  all: "Belum ada task.",
  action: "Tidak ada yang perlu dikerjakan.",
  waiting: "Tidak ada yang menunggu Admin.",
  done: "Belum ada task selesai.",
};

/** What a filtered-but-empty list says, whatever the tab. */
export const MY_TASKS_FILTERED_EMPTY = "Tidak ada konten sesuai filter.";

function myTabDef(tab: MyTaskTab): MyTaskTabDef {
  return MY_TASK_TABS.find((candidate) => candidate.key === tab) ?? MY_TASK_TABS[0];
}

/** The statuses the status filter offers on this tab. */
export function myStatusOptionsFor(tab: MyTaskTab): readonly TaskStatusFilter[] {
  return myTabDef(tab).statuses ?? TASK_STATUS_FILTERS;
}

/** One view of Task Saya, every value checked. */
export interface MyTasksParams {
  tab: MyTaskTab;
  page: number;
  q: string;
  type: ContentType[];
  status: TaskStatusFilter[];
  overdue: OverdueFilter;
  period: PeriodFilter;
  from: string;
  to: string;
  sort: DeadlineSort;
}

export const DEFAULT_MY_TASKS_PARAMS: MyTasksParams = {
  tab: "all",
  page: 1,
  q: "",
  type: [],
  status: [],
  overdue: "all",
  period: "all",
  from: "",
  to: "",
  sort: DEFAULT_MY_TASKS_SORT,
};

/**
 * The URL's values as the page's state. Anything the page cannot hold — an unknown tab, a
 * pending proposal, a status the open tab never holds, a page of zero — falls back to the
 * default rather than reaching the API, which would only answer with a 400 or an empty list
 * nobody could explain.
 */
export function parseMyTasksParams(params: SearchParams): MyTasksParams {
  const tab = oneOf(MY_TASK_TAB_KEYS, single(params.tab), "all");

  return {
    tab,
    page: pageNumber(params.page),
    q: single(params.q).trim(),
    type: listOf(CONTENT_TYPES, params.type),
    status: listOf(myStatusOptionsFor(tab), params.status),
    overdue: oneOf(OVERDUE_FILTERS, single(params.overdue), "all"),
    period: oneOf(PERIOD_FILTERS, single(params.period), "all"),
    from: calendarDay(single(params.from)),
    to: calendarDay(single(params.to)),
    sort: oneOf(SORT_DIRECTIONS, single(params.sort), DEFAULT_MY_TASKS_SORT),
  };
}

/** The statuses in the address no tab can hold, so the page can say why they were ignored. */
export function unknownStatuses(params: SearchParams): string[] {
  return list(params.status).filter(
    (status) => !(TASK_STATUS_FILTERS as readonly string[]).includes(status),
  );
}

/** The non-default parts of the state as query parameters, in a stable order. */
export function buildMyTasksQuery(state: MyTasksParams): Record<string, string> {
  const query: Record<string, string> = {};
  if (state.tab !== "all") query.tab = state.tab;
  if (state.q) query.q = state.q;
  if (state.type.length > 0) query.type = state.type.join(",");
  if (state.status.length > 0) query.status = state.status.join(",");
  if (state.overdue !== "all") query.overdue = state.overdue;
  if (state.period !== "all") query.period = state.period;
  if (state.from) query.from = state.from;
  if (state.to) query.to = state.to;
  if (state.sort !== DEFAULT_MY_TASKS_SORT) query.sort = state.sort;
  if (state.page > 1) query.page = String(state.page);
  return query;
}

/** Whether a search or filter narrowed the view, which changes what an empty list means. */
export function isMyTasksFiltered(state: MyTasksParams): boolean {
  return (
    state.q !== "" ||
    state.type.length > 0 ||
    state.status.length > 0 ||
    state.overdue !== "all" ||
    state.period !== "all"
  );
}

/**
 * A tab change: the search and the filters carry over, but the status picks, the sort
 * direction and the page belong to the tab that was left behind.
 */
export function myTasksAfterTabChange(state: MyTasksParams, tab: MyTaskTab): MyTasksParams {
  return { ...state, tab, status: [], sort: DEFAULT_MY_TASKS_SORT, page: 1 };
}

export type MyTaskAction = "submit_draft" | "resubmit_draft" | "submit_video";

export interface MyTask {
  /** The id the draft and video endpoints take. */
  id: string;
  name: string;
  type: ContentType;
  brief: string;
  /** Plain calendar day, "YYYY-MM-DD". */
  deadline: string;
  status: ContentStatus;
  /** Late, overdue or approval bypassed, as the admin sees them; empty when nothing is flagged. */
  tags: ContentTag[];
  /** The buttons this row shows today, in display order; empty means none. */
  actions: MyTaskAction[];
  /** What the admin asked to change; set only while the row awaits a resubmit. */
  revisionNotes: string | null;
}

export type MyTasksCounts = Record<MyTaskTab, number>;

export interface MyTasksResponse {
  items: MyTask[];
  page: number;
  pageSize: number;
  /** The open tab's tasks under every filter, across every page. */
  total: number;
  totalPages: number;
  /** Every tab's size under the search and filters, whichever tab is open. */
  counts: MyTasksCounts;
}

/** A failed answer from the API, keeping the status so a 401 can read differently. */
export class MyTasksError extends Error {
  constructor(readonly status: number) {
    super(`Loading my tasks failed with HTTP ${status}`);
    this.name = "MyTasksError";
  }
}
