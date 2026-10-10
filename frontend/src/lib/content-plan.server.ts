// Server-side only: the cross-creator Content Plan list, fetched while the page renders. It
// reads the browser's session through next/headers, which client components cannot import, so
// it lives apart from the shared content-plan module.
//
// The endpoint is the 5.1 contract (GET /contents). Its query and its answer are spelled in
// the API's own words, so both pass through content-list-api, the one module that knows them.

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

/** How far the creator filter looks for names: twenty pages of ten, never an endless walk. */
const MAX_CREATOR_PAGES = 20;

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
 * picker offers every admin, not only the ten the first page holds.
 */
export async function fetchContentPlanCreatorOptions(): Promise<ContentPlanCreatorOption[]> {
  const options: ContentPlanCreatorOption[] = [];

  for (let page = 1; page <= MAX_CREATOR_PAGES; page += 1) {
    const list = await fetchCreators(page);
    options.push(...list.items.map(({ id, name }) => ({ id, name })));

    if (page >= list.totalPages) {
      break;
    }
  }

  return options;
}
