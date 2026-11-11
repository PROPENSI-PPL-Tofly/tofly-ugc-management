// The link list behind the admin's "Performa Konten" and the creator's own Performa page
// (PBI-27, 27.6): GET /performance/links' row shape, the page's URL state and the query the
// endpoint reads. Pure module — no fetch, no clock — so both pages share one vocabulary and
// the tests pin the wire shape without a server. The row mirrors the backend's
// toPerformanceLinkItem, so a change on either side is a change here first.

import { DATA_STATE_LABELS, type DataState, type LinkPerformance } from "./link-performance";
import { MAX_FILTER_VALUES } from "./content-list-api";
import { PLATFORMS, type Platform } from "./platform-links";
import { list, listOf, pageNumber, type SearchParams } from "./search-params";

const DATA_STATES = Object.keys(DATA_STATE_LABELS) as DataState[];

/** The admin page's address and the rows each page holds (AC 23: ten per page). */
export const PERFORMANCE_LINKS_BASE = "/admin/performance";
export const PERFORMANCE_PAGE_SIZE = 10;

/** The two addresses a page of links is read from: every creator's for the admin (27.1), the
 * session's own for their Performa page. Neither takes a creator in the address. */
export const PERFORMANCE_LINKS_PATH = "/performance/links";
export const MY_PERFORMANCE_LINKS_PATH = "/me/performance/links";

/** A load of the link list that failed, with the backend's status (502 for an unusable 200). */
export class PerformanceLinksError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Loading the performance links failed with HTTP ${status}`);
    this.name = "PerformanceLinksError";
    this.status = status;
  }
}

/** One row of either list: a submitted link with its numbers and state (AC 22). */
export interface PerformanceLinkRow extends LinkPerformance {
  linkId: string;
  /** The id Content Detail opens by (AC 25). */
  contentId: string;
  contentName: string;
  creatorId: string;
  creatorName: string;
  platform: Platform | null;
  url: string;
}

/** One page of the list, as GET /performance/links answers it. */
export interface PerformanceLinksPage {
  items: PerformanceLinkRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** The list's state as it lives in the URL: the page and the three filters. */
export interface PerformanceLinksState {
  page: number;
  creator: string[];
  platform: Platform[];
  /** Status Data: the states a row shows, `?state=` in the address. */
  dataState: DataState[];
}

/** The URL's values as the list's state, every one checked. Anything the list cannot hold — a
 * platform from another world, a page of zero — falls back to its default rather than reaching
 * an API that would only answer 400. */
export function parsePerformanceLinksParams(params: SearchParams): PerformanceLinksState {
  return {
    page: pageNumber(params.page),
    creator: list(params.creator),
    platform: listOf(PLATFORMS, params.platform),
    dataState: listOf(DATA_STATES, params.state),
  };
}

/** The non-default parts of the state as query parameters, in a stable order. Defaults are
 * left out so the bare list stays at the bare address; a multi-select goes out comma-separated,
 * the way the URL contract reads it. */
export function buildPerformanceLinksQuery(state: PerformanceLinksState): Record<string, string> {
  const query: Record<string, string> = {};
  if (state.creator.length > 0) query.creator = state.creator.join(",");
  if (state.platform.length > 0) query.platform = state.platform.join(",");
  if (state.dataState.length > 0) query.state = state.dataState.join(",");
  if (state.page > 1) query.page = String(state.page);
  return query;
}

/** The page's own address for a state: the bare path, or the path with its query. */
export function performanceLinksHref(state: PerformanceLinksState): string {
  const search = new URLSearchParams(buildPerformanceLinksQuery(state)).toString();
  return search ? `${PERFORMANCE_LINKS_BASE}?${search}` : PERFORMANCE_LINKS_BASE;
}

/** Each pick once, and no more of them than the API takes for one filter. */
function picks(values: readonly string[]): string[] {
  return [...new Set(values)].slice(0, MAX_FILTER_VALUES);
}

/**
 * The state as the query GET /performance/links reads: a multi-select goes out as one parameter
 * per pick, which is how the API reads a list, and the page is always named, whichever one is
 * asked for. The URL's comma-joined state is never sent as-is (OWASP A03: only values the page
 * itself parsed reach the API).
 */
export function toPerformanceLinksQuery(state: PerformanceLinksState): URLSearchParams {
  const query = new URLSearchParams();

  for (const creator of picks(state.creator)) query.append("creator", creator);
  for (const platform of picks(state.platform)) query.append("platform", platform);
  for (const dataState of picks(state.dataState)) query.append("state", dataState);
  query.set("page", String(state.page));

  return query;
}

/** A 200 whose body the pages cannot use reads as a failure, never as an empty list: a paged
 * list that silently dropped a malformed row would show a short page and hide the drift. */
const UNUSABLE_ANSWER = 502;


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Null is no data yet and is never read as 0 (AC 2); anything else is a whole number from below. */
function isMetric(value: unknown): boolean {
  return value === null || (typeof value === "number" && Number.isInteger(value) && value >= 0);
}

function isMoment(value: unknown): boolean {
  return value === null || typeof value === "string";
}

function toRow(entry: unknown): PerformanceLinkRow {
  if (!isRecord(entry)) throw new PerformanceLinksError(UNUSABLE_ANSWER);

  const {
    linkId,
    contentId,
    contentName,
    creatorId,
    creatorName,
    platform,
    url,
    views,
    likes,
    comments,
    shares,
    state,
    lastSyncedAt,
    manualAt,
  } = entry;

  if (
    typeof linkId !== "string" ||
    typeof contentId !== "string" ||
    typeof contentName !== "string" ||
    typeof creatorId !== "string" ||
    typeof creatorName !== "string" ||
    typeof url !== "string" ||
    (platform !== null && !(PLATFORMS as readonly unknown[]).includes(platform)) ||
    !(DATA_STATES as readonly unknown[]).includes(state) ||
    !isMetric(views) ||
    !isMetric(likes) ||
    !isMetric(comments) ||
    !isMetric(shares) ||
    !isMoment(lastSyncedAt) ||
    !isMoment(manualAt)
  ) {
    throw new PerformanceLinksError(UNUSABLE_ANSWER);
  }

  return {
    linkId,
    contentId,
    contentName,
    creatorId,
    creatorName,
    platform: platform as Platform | null,
    url,
    views: views as number | null,
    likes: likes as number | null,
    comments: comments as number | null,
    shares: shares as number | null,
    state: state as DataState,
    lastSyncedAt: lastSyncedAt as string | null,
    manualAt: manualAt as string | null,
  };
}

function isCount(value: unknown, atLeast: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= atLeast;
}

/** The API's page answer into the list's rows. Every row is checked whole: one refused row
 * refuses the answer, so a contract drift shows as the page's error state and a red test. */
export function toPerformanceLinksPage(raw: unknown): PerformanceLinksPage {
  if (!isRecord(raw) || !Array.isArray(raw.items)) {
    throw new PerformanceLinksError(UNUSABLE_ANSWER);
  }
  const { page, pageSize, total, totalPages } = raw;
  if (
    !isCount(page, 1) ||
    !isCount(pageSize, 1) ||
    !isCount(total, 0) ||
    !isCount(totalPages, 0)
  ) {
    throw new PerformanceLinksError(UNUSABLE_ANSWER);
  }

  return {
    items: raw.items.map(toRow),
    page,
    pageSize,
    total,
    totalPages,
  };
}
