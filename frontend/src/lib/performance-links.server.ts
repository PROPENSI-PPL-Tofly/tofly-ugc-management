// Server-side only: a page of submitted links with their numbers, fetched while a page
// renders. It reads the browser's session through next/headers, which client components cannot
// import, so it lives apart from the shared performance-links module. GET /performance/links
// (27.1) serves the admin's "Performa Konten"; the creator's own links are read from
// /me/performance/links, scoped to the session behind it. Single Responsibility: this module
// fetches (address, session, errors) and performance-links translates.

import { backendGet } from "./backend.server";
import {
  MY_PERFORMANCE_LINKS_PATH,
  PERFORMANCE_LINKS_PATH,
  PerformanceLinksError,
  toPerformanceLinksPage,
  toPerformanceLinksQuery,
  type PerformanceLinksPage,
  type PerformanceLinksState,
} from "./performance-links";

/** A 200 whose body the pages cannot use reads as a failure, never as an empty list. */
const UNUSABLE_ANSWER = 502;

async function fetchLinks(
  path: string,
  state: PerformanceLinksState,
): Promise<PerformanceLinksPage> {
  const response = await backendGet(`${path}?${toPerformanceLinksQuery(state)}`);

  if (!response.ok) {
    throw new PerformanceLinksError(response.status);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new PerformanceLinksError(UNUSABLE_ANSWER);
  }
  return toPerformanceLinksPage(body);
}

/**
 * The admin's page of every creator's submitted links (AC 22). Admin-only behind the session:
 * the endpoint refuses a creator's session outright (AC 26). Only the filters the page itself
 * parsed are sent on (OWASP A03).
 */
export function fetchPerformanceLinks(
  state: PerformanceLinksState,
): Promise<PerformanceLinksPage> {
  return fetchLinks(PERFORMANCE_LINKS_PATH, state);
}

/**
 * The creator's own page of links for their Performa page (AC 20). The request names nobody:
 * the endpoint scopes the rows to the session's creator, so no address can reach another
 * creator's numbers (OWASP A01).
 */
export function fetchMyPerformanceLinks(
  state: PerformanceLinksState,
): Promise<PerformanceLinksPage> {
  return fetchLinks(MY_PERFORMANCE_LINKS_PATH, state);
}
