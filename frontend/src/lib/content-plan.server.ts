// Server-side only: the cross-creator Content Plan list, fetched while the page renders. It
// reads the browser's session through next/headers, which client components cannot import, so
// it lives apart from the shared content-plan module.
//
// The endpoint is the 5.1 contract (GET /contents). Its query and its answer are spelled in
// the API's own words, so both pass through content-list-api, the one module that knows them.

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
import { jakartaDay } from "./format";
import { appSessionCookieHeader } from "./session-cookie";

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
  const backendUrl = process.env.BACKEND_URL;

  if (!backendUrl) {
    throw new Error("BACKEND_URL is not configured");
  }

  // Named periods ("30 hari ke depan") are counted from today where the admins work.
  const query = toContentListQuery(state, jakartaDay());

  // Admin-only: the request carries the browser's session, and only it.
  const cookie = await appSessionCookieHeader();
  const response = await fetch(`${withoutTrailingSlash(backendUrl)}/contents?${query}`, {
    cache: "no-store",
    ...(cookie && { headers: { cookie } }),
  });

  if (!response.ok) {
    throw new Error(`Loading the content plan failed with HTTP ${response.status}`);
  }

  return toContentPlanResponse((await response.json()) as RawContentList);
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
