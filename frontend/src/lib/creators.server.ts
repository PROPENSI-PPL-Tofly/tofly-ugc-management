// Server-side only: the Creator Database list, fetched while the page renders. It reads the
// browser's session through next/headers, which client components cannot import, so it lives
// apart from the shared creators module.

import {
  buildCreatorsQuery,
  NO_FILTERS,
  type CreatorFilterState,
  type CreatorListResponse,
} from "./creators";
import { appSessionCookieHeader } from "./session-cookie";

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
export async function fetchCreators(
  page: number,
  filters: CreatorFilterState = NO_FILTERS,
): Promise<CreatorListResponse> {
  const backendUrl = process.env.BACKEND_URL;

  if (!backendUrl) {
    throw new Error("BACKEND_URL is not configured");
  }

  const query = buildCreatorsQuery({ ...filters, page });

  // The Creator Database is admin-only: the request carries the browser's session, and only it.
  const cookie = await appSessionCookieHeader();
  const response = await fetch(`${withoutTrailingSlash(backendUrl)}/creators?${query}`, {
    cache: "no-store",
    ...(cookie && { headers: { cookie } }),
  });

  if (!response.ok) {
    throw new Error(`Loading creators failed with HTTP ${response.status}`);
  }

  return (await response.json()) as CreatorListResponse;
}
