// Server-side only: the cross-creator Content Plan list, fetched while the page renders. It
// reads the browser's session through next/headers, which client components cannot import, so
// it lives apart from the shared content-plan module.
//
// The endpoint is the 5.1 contract (GET /contents). Until that subtask lands the fetch fails
// and the page offers a retry; the shape it answers with is the one this app expects.

import { fetchCreators } from "./creators.server";
import {
  buildContentPlanQuery,
  type ContentPlanCreatorOption,
  type ContentPlanParams,
  type ContentPlanResponse,
} from "./content-plan";
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

  const query = new URLSearchParams(buildContentPlanQuery(state));
  // The API counts on a page number whichever page is asked for, page one included.
  query.set("page", String(state.page));

  // Admin-only: the request carries the browser's session, and only it.
  const cookie = await appSessionCookieHeader();
  const response = await fetch(`${withoutTrailingSlash(backendUrl)}/contents?${query}`, {
    cache: "no-store",
    ...(cookie && { headers: { cookie } }),
  });

  if (!response.ok) {
    throw new Error(`Loading the content plan failed with HTTP ${response.status}`);
  }

  return (await response.json()) as ContentPlanResponse;
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
