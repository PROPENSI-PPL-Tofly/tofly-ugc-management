// Server-side only: one creator's detail, fetched while the page renders. It reads the
// browser's session through next/headers, which client components cannot import, so it lives
// apart from the shared creator-detail module.
//
// The endpoint is the 4.1 contract (GET /creators/:id). Its query and its answer are spelled in
// the API's own words, so both pass through creator-detail-api, the one module that knows them.

import { isUuid, type CreatorDetailParams, type CreatorDetailView } from "./creator-detail";
import {
  toCreatorDetailQuery,
  toCreatorDetailView,
  type RawCreatorDetail,
} from "./creator-detail-api";
import { appSessionCookieHeader } from "./session-cookie";

function withoutTrailingSlash(url: string): string {
  let end = url.length;

  while (end > 0 && url[end - 1] === "/") {
    end -= 1;
  }

  return url.slice(0, end);
}

/**
 * The creator's profile, contract history and the open contract's content, or null when there
 * is no such creator. Any other failure throws, so the page offers a retry rather than telling
 * the admin a creator is gone when it was the request that failed.
 *
 * This app talks to the backend directly, so the address never reaches the browser.
 * BACKEND_URL is read per call because it is a plain runtime variable on the deployed service;
 * a module-scope read would freeze whatever it was at build time.
 */
export async function fetchCreatorDetail(
  id: string,
  state: CreatorDetailParams,
): Promise<CreatorDetailView | null> {
  // The id comes from the address bar. One that is not an id names no creator, and is never
  // put into a request path to find that out (OWASP A03).
  if (!isUuid(id)) return null;

  const backendUrl = process.env.BACKEND_URL;

  if (!backendUrl) {
    throw new Error("BACKEND_URL is not configured");
  }

  const query = toCreatorDetailQuery(state);

  // Admin-only: the request carries the browser's session, and only it (OWASP A01).
  const cookie = await appSessionCookieHeader();
  const response = await fetch(
    `${withoutTrailingSlash(backendUrl)}/creators/${encodeURIComponent(id)}?${query}`,
    {
      cache: "no-store",
      ...(cookie && { headers: { cookie } }),
    },
  );

  if (response.status === 404) return null;

  if (!response.ok) {
    throw new Error(`Loading creator detail failed with HTTP ${response.status}`);
  }

  return toCreatorDetailView((await response.json()) as RawCreatorDetail, state);
}
