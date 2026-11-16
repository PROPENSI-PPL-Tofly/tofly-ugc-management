// Server-side only: the cross-creator Content Plan list, fetched while the page renders. It
// reads the browser's session through next/headers, which client components cannot import, so
// it lives apart from the shared content-plan module.
//
// The endpoint is the 5.1 contract (GET /contents). Its query and its answer are spelled in
// the API's own words, so both pass through content-list-api, the one module that knows them.
// Single Responsibility: this module fetches (address, session, errors) and content-list-api
// translates; each has one reason to change.

import { NO_FILTERS } from "./creators";
import { fetchCreators } from "./creators.server";
import {
  toContentListQuery,
  toContentPlanResponse,
  type RawContentList,
} from "./content-list-api";
import type {
  ContentPlanCreatorOption,
  ContentPlanParams,
  ContentPlanResponse,
} from "./content-plan";
import {
  CALENDAR_PAGE_LIMIT,
  CALENDAR_PAGE_SIZE,
  monthRange,
} from "./content-plan-calendar";
import { jakartaDay } from "./format";
import { appSessionCookieHeader } from "./session-cookie";
import type { CalendarMonth } from "./task-calendar";

/** The names arrive in the API's largest pages — fifty at a time, its own ceiling. */
const CREATORS_PAGE_SIZE = 50;

/** Two hundred names, the ceiling the old twenty pages of ten held — four pages of fifty. */
const MAX_CREATOR_PAGES = 4;

function withoutTrailingSlash(url: string): string {
  let end = url.length;

  while (end > 0 && url[end - 1] === "/") {
    end -= 1;
  }

  return url.slice(0, end);
}

/**
 * This app talks to the backend directly, so the address never reaches the browser.
 * BACKEND_URL is read per call because it is a plain runtime variable on the deployed service;
 * a module-scope read would freeze whatever it was at build time.
 */
export async function fetchContentPlan(
  state: ContentPlanParams,
): Promise<ContentPlanResponse> {
  // Named periods ("30 hari ke depan") are counted from today where the admins work.
  return toContentPlanResponse(await readContentList(toContentListQuery(state, jakartaDay())));
}

/** One GET /contents, admin-only: the request carries the browser's session, and only it. */
async function readContentList(query: URLSearchParams): Promise<RawContentList> {
  const backendUrl = process.env.BACKEND_URL;

  if (!backendUrl) {
    throw new Error("BACKEND_URL is not configured");
  }

  const cookie = await appSessionCookieHeader();
  const response = await fetch(`${withoutTrailingSlash(backendUrl)}/contents?${query}`, {
    cache: "no-store",
    ...(cookie && { headers: { cookie } }),
  });

  if (!response.ok) {
    throw new Error(`Loading the content plan failed with HTTP ${response.status}`);
  }

  return (await response.json()) as RawContentList;
}

/** A month holds more pages than the calendar draws: shown as an error, never as part of it. */
export class ContentPlanCalendarTooLargeError extends Error {
  constructor(readonly totalPages: number) {
    super(
      `The month holds ${totalPages} pages of content, past the calendar's ${CALENDAR_PAGE_LIMIT}`,
    );
    this.name = "ContentPlanCalendarTooLargeError";
  }
}

/**
 * Every content of one month under the tab, search and filters, for the calendar (I3.6). The
 * month is the deadline range and the rows come in the API's largest pages: the first says how
 * many there are, the rest are read together. A failure on any page fails the whole read, and a
 * month past the page limit is refused before the rest are asked for: a calendar missing some
 * of its content would look complete and be wrong (OWASP A06).
 */
export async function fetchContentPlanMonth(
  state: ContentPlanParams,
  month: CalendarMonth,
): Promise<ContentPlanResponse> {
  const [from, to] = monthRange(month);
  const page = (number: number) => {
    const query = toContentListQuery(
      { ...state, period: "custom", from, to, sort: "asc", page: number },
      from,
    );
    query.set("pageSize", String(CALENDAR_PAGE_SIZE));
    return readContentList(query);
  };

  const first = await page(1);
  if (first.totalPages > CALENDAR_PAGE_LIMIT) {
    throw new ContentPlanCalendarTooLargeError(first.totalPages);
  }

  const rest = await Promise.all(
    Array.from({ length: Math.max(0, first.totalPages - 1) }, (_, index) => page(index + 2)),
  );

  return toContentPlanResponse({
    ...first,
    items: [first, ...rest].flatMap((answer) => answer.items),
  });
}

/**
 * The names behind the creator filter, gathered across the Creator Database's pages so the
 * picker offers every admin, not only the first page. Page one carries the count; whatever
 * pages remain then run at once, capped at two hundred names so a huge roster cannot turn
 * the render into a long walk.
 */
export async function fetchContentPlanCreatorOptions(): Promise<ContentPlanCreatorOption[]> {
  const first = await fetchCreators(1, NO_FILTERS, CREATORS_PAGE_SIZE);
  const options = first.items.map(({ id, name }) => ({ id, name }));
  const pages = Math.min(first.totalPages, MAX_CREATOR_PAGES);

  if (pages > 1) {
    const rest = await Promise.all(
      Array.from({ length: pages - 1 }, (_, index) =>
        fetchCreators(index + 2, NO_FILTERS, CREATORS_PAGE_SIZE),
      ),
    );

    for (const list of rest) {
      options.push(...list.items.map(({ id, name }) => ({ id, name })));
    }
  }

  return options;
}
