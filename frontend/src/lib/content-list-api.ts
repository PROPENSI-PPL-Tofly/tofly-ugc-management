// The translation between the Content Plan page and GET /contents (subtask 5.1): the page's
// state as the query the API reads, and the API's answer as the rows and counters the page
// renders. The page keeps a short vocabulary in its address bar ("action", "asc", "yes", a
// named period); the API has its own ("needs_approval", "deadline_asc", "true", two days).
// Everything that knows both lives here, so either side can change without the other moving.
//
// Pure module: no next/headers and no clock of its own, so it runs anywhere and tests pin
// "today" by passing it in.

import type { ContentType } from "./contents";
import type {
  ContentPlanCounts,
  ContentPlanParams,
  ContentPlanResponse,
  ContentPlanTab,
  DeadlineSort,
  OverdueFilter,
} from "./content-plan";
import type { ContentStatus, ContentTag } from "./creators";

/** The most values the API takes for one multi-select filter; a longer list is a 400. */
export const MAX_FILTER_VALUES = 50;

/** The longest search the API takes. */
const MAX_SEARCH_LENGTH = 100;

const MS_PER_DAY = 86_400_000;

/** What an id looks like to the API: 8-4-4-4-12 hexadecimal, and nothing more. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ApiTab = "all" | "needs_approval" | "waiting_creator" | "done";

// One line per tab, so a tab added to the page fails to compile here until the API's name for
// it is given.
const API_TAB: Record<ContentPlanTab, ApiTab> = {
  all: "all",
  action: "needs_approval",
  waiting: "waiting_creator",
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

/** One row as the API sends it. */
export interface RawContentListItem {
  id: string;
  name: string;
  creatorId: string;
  creatorName: string;
  type: ContentType;
  /** Plain calendar day, "YYYY-MM-DD". */
  deadline: string;
  status: ContentStatus;
  tags: ContentTag[];
  revisionCount: number;
}

export interface RawContentList {
  items: RawContentListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  tabCounts: Record<ApiTab, number>;
}

/** A calendar day moved by a number of days, counted in UTC so no timezone can shift it. */
function shiftDay(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** The first and the last day of the month a day falls in. */
function monthOf(day: string): [string, string] {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  // Day zero of the next month is the last day of this one, leap years included.
  const last = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);

  return [`${day.slice(0, 8)}01`, last];
}

/**
 * The two ends of the deadline range a period stands for; an empty end is left open. A custom
 * range picked backwards is put in order, since the API refuses a start after its end.
 */
function periodRange(state: ContentPlanParams, today: string): [string, string] {
  switch (state.period) {
    case "month":
      return monthOf(today);
    case "next30":
      return [today, shiftDay(today, 30)];
    case "last90":
      return [shiftDay(today, -90), today];
    case "custom":
      return state.from && state.to && state.from > state.to
        ? [state.to, state.from]
        : [state.from, state.to];
    default:
      return ["", ""];
  }
}

/** Each pick once, and no more of them than the API takes for one filter. */
function picks(values: readonly string[]): string[] {
  return [...new Set(values)].slice(0, MAX_FILTER_VALUES);
}

/**
 * The page's state as the query GET /contents reads. A multi-select goes out as one parameter
 * per pick, which is how the API reads a list. A creator that is not an id is dropped here:
 * the API would answer 400 for the whole page, and the value came from the address bar, where
 * anyone can type anything (OWASP A03).
 */
export function toContentListQuery(state: ContentPlanParams, today: string): URLSearchParams {
  const query = new URLSearchParams();

  if (state.tab !== "all") query.set("tab", API_TAB[state.tab]);
  if (state.q) query.set("q", state.q.slice(0, MAX_SEARCH_LENGTH));

  for (const creator of picks(state.creator.filter((id) => UUID.test(id)))) {
    query.append("creator", creator);
  }
  for (const type of picks(state.type)) query.append("type", type);
  for (const status of picks(state.status)) query.append("status", status);

  const overdue = API_OVERDUE[state.overdue];
  if (overdue) query.set("overdue", overdue);

  const [from, to] = periodRange(state, today);
  if (from) query.set("deadlineFrom", from);
  if (to) query.set("deadlineTo", to);

  if (state.sort !== "desc") query.set("sort", API_SORT[state.sort]);

  // The API counts on a page number whichever page is asked for, page one included.
  query.set("page", String(state.page));

  return query;
}

/** The API's answer under the page's names: `id` as `contentId`, each counter under its tab. */
export function toContentPlanResponse(raw: RawContentList): ContentPlanResponse {
  const counts = Object.fromEntries(
    (Object.keys(API_TAB) as ContentPlanTab[]).map((tab) => [tab, raw.tabCounts[API_TAB[tab]] ?? 0]),
  ) as unknown as ContentPlanCounts;

  return {
    items: raw.items.map(({ id, ...row }) => ({ contentId: id, ...row })),
    total: raw.total,
    totalPages: raw.totalPages,
    counts,
  };
}
