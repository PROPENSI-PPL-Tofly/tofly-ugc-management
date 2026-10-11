// The translation between the Task Saya page and GET /me/contents: the page's state as the
// query the API reads, and the API's answer as the rows and counters the page renders. The
// page keeps the admin Content Plan's short vocabulary in its address bar ("action", "asc",
// "yes", a named period); the API has its own ("to_do", "deadline_asc", "true", two days).
// Everything that knows both lives here, so a filter can never be spelled one way on the page
// and another on the API and silently do nothing.
//
// Pure module: no next/headers and no clock of its own, so tests pin "today" by passing it in.

import type { DeadlineSort, OverdueFilter } from "./content-plan";
import { periodRange } from "./deadline-period";
import {
  MY_TASKS_PAGE_SIZE,
  type MyTask,
  type MyTasksParams,
  type MyTasksResponse,
  type MyTaskTab,
} from "./my-tasks";

/** The longest search the API takes. */
const MAX_SEARCH_LENGTH = 100;

type ApiTab = "all" | "to_do" | "waiting_admin" | "done";

/** Every tab the API counts, so an answer missing one can be refused. */
export const API_TABS: readonly ApiTab[] = ["all", "to_do", "waiting_admin", "done"];

// One line per tab, so a tab added to the page fails to compile here until the API's name for
// it is given.
const API_TAB: Record<MyTaskTab, ApiTab> = {
  all: "all",
  action: "to_do",
  waiting: "waiting_admin",
  done: "done",
};

const API_SORT: Record<DeadlineSort, string> = {
  asc: "deadline_asc",
  desc: "deadline_desc",
};

/** Null where the filter is not applied, so nothing is sent for it. */
const API_OVERDUE: Record<OverdueFilter, string | null> = {
  all: null,
  yes: "true",
  no: "false",
};

/** GET /me/contents's answer as it arrives. */
export interface RawMyContents {
  items: MyTask[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  tabCounts: Record<ApiTab, number>;
}

/**
 * The page's state as the query GET /me/contents reads. A multi-select goes out as one
 * parameter per pick, which is how the API reads a list; the API's defaults (Semua, nearest
 * deadline first) are left for it to apply.
 */
export function toMyContentsQuery(state: MyTasksParams, today: string): URLSearchParams {
  const query = new URLSearchParams();

  if (state.tab !== "all") query.set("tab", API_TAB[state.tab]);
  if (state.q) query.set("q", state.q.slice(0, MAX_SEARCH_LENGTH));
  for (const type of new Set(state.type)) query.append("type", type);
  for (const status of new Set(state.status)) query.append("status", status);

  const overdue = API_OVERDUE[state.overdue];
  if (overdue) query.set("overdue", overdue);

  const [from, to] = periodRange(state, today);
  if (from) query.set("deadlineFrom", from);
  if (to) query.set("deadlineTo", to);

  if (state.sort !== "asc") query.set("sort", API_SORT[state.sort]);

  query.set("page", String(state.page));
  query.set("pageSize", String(MY_TASKS_PAGE_SIZE));

  return query;
}

/** The API's answer under the page's names: each counter under its tab. */
export function toMyTasksResponse(raw: RawMyContents): MyTasksResponse {
  const { tabCounts, ...paged } = raw;
  return {
    ...paged,
    counts: {
      all: tabCounts.all,
      action: tabCounts.to_do,
      waiting: tabCounts.waiting_admin,
      done: tabCounts.done,
    },
  };
}
