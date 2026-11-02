// The URL contract of the Creator Detail page (PBI 4, subtask 4.2). The page lives in the URL:
// which contract is open, the table's filters and its page number are parameters, so a view can
// be linked, bookmarked and reloaded. Pure module — no next/headers — so client components can
// share it.

import type { Tone } from "@/components/ui/pill";
import { CONTENT_STATUS_LABELS, CONTENT_TYPE_LABELS } from "./content-labels";
import type { ContentType } from "./contents";
import type { ContractType } from "./creator-form";
import {
  parseFilters,
  parsePage,
  type ContentStatus,
  type ContentTag,
  type CreatorFilterState,
  type CreatorSummary,
} from "./creators";
import { listOf, pageNumber, single, type SearchParams } from "./search-params";

/** The Creator Database, where the way back from a creator's page always leads. */
export const CREATOR_DATABASE_BASE = "/admin/creators";

/** A contract's table shows ten rows a page, as 4.1 serves them. */
export const CREATOR_DETAIL_PAGE_SIZE = 10;

// Read off the label maps, which must name every status and type to compile, so a status added
// to the lifecycle is a filter choice here without being listed a second time.
const CONTENT_STATUSES = Object.keys(CONTENT_STATUS_LABELS) as ContentStatus[];
const CONTENT_TYPES = Object.keys(CONTENT_TYPE_LABELS) as ContentType[];

/** What an id looks like to the API: 8-4-4-4-12 hexadecimal, and nothing more. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a value from the address could be an id at all, before anything is asked with it. */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}

export interface CreatorDetailParams {
  /** The contract whose content is on show; null for the newest one. */
  contract: string | null;
  type: ContentType[];
  status: ContentStatus[];
  page: number;
  /**
   * The Creator Database view the admin came from, as its query ("q=nadia&page=2"); absent for
   * the bare roster. Only what the roster reads is ever kept here.
   */
  back?: string;
}

export const DEFAULT_CREATOR_DETAIL_PARAMS: CreatorDetailParams = {
  contract: null,
  type: [],
  status: [],
  page: 1,
};

// What the page shows, in the page's own names. Components read these and never the API's
// answer, so a change to the endpoint stops at creator-detail-api.

export interface CreatorProfile {
  id: string;
  name: string;
  email: string;
  /** Only the handles the creator has. */
  socials: Partial<Record<"instagram" | "tiktok", string>>;
}

/** A contract always has dates, so it is running, over or yet to start. */
export type PeriodStatus = "active" | "expired" | "upcoming";

/** Worded as the prototype words them, on the profile and on every period tab. */
export const PERIOD_STATUS_LABELS: Record<PeriodStatus, string> = {
  active: "Aktif",
  expired: "Berakhir",
  upcoming: "Belum Dimulai",
};

/** Always beside its label, so colour is never the only signal. */
export const PERIOD_STATUS_TONES: Record<PeriodStatus, Tone> = {
  active: "green",
  expired: "neutral",
  upcoming: "accent",
};

/** One contract of the creator's history, as one period tab and its terms. */
export interface CreatorPeriod {
  contractId: string;
  /** 1 for the first contract, counting up with every renewal. */
  periodNumber: number;
  type: ContractType;
  /** Plain calendar day, "YYYY-MM-DD". */
  startDate: string;
  endDate: string;
  status: PeriodStatus;
  contentQuota: number;
  /** The Evergreen contents planned in the period, up to its quota: the quota less the room left. */
  evergreenCount: number;
  /** The quota less the Evergreen planned; never below nothing. */
  remainingEvergreenQuota: number;
  /** The default interval between deadlines, in days. */
  daysBetween: number;
  /** The period's committed contents and how many are handed in, as the roster counts them. */
  progress?: CreatorSummary["progress"];
  /** On-time rate, average revisions and productivity, measured over this period alone. */
  performance?: CreatorSummary["performance"];
}

export interface CreatorContentRow {
  contentId: string;
  name: string;
  type: ContentType;
  /** Plain calendar day, "YYYY-MM-DD". */
  deadline: string;
  status: ContentStatus;
  tags: ContentTag[];
  /** How many times an admin asked for a revision. */
  revisionCount: number;
}

export interface CreatorDetailView {
  creator: CreatorProfile;
  /** Newest first, as the tabs are laid out. */
  periods: CreatorPeriod[];
  /** The period whose content is on show; null for a creator without a contract. */
  selected: CreatorPeriod | null;
  rows: CreatorContentRow[];
  page: number;
  /** The open period's content across every page, after the filters. */
  total: number;
  totalPages: number;
}

/**
 * The URL's values as the page's state, every one checked. The address bar takes anything, so
 * a contract that is not an id, a status from another world or a page of zero falls back to the
 * default here rather than reaching the API (OWASP A03).
 */
export function parseCreatorDetailParams(params: SearchParams): CreatorDetailParams {
  const contract = single(params.contract);
  const back = readCreatorDatabaseView(single(params.return));

  return {
    contract: isUuid(contract) ? contract : null,
    type: listOf(CONTENT_TYPES, params.type),
    status: listOf(CONTENT_STATUSES, params.status),
    page: pageNumber(params.page),
    ...(back ? { back } : {}),
  };
}

/**
 * A Creator Database view as the query that names it: the search, both filters and the page,
 * defaults left out. The roster's own links and the way back write it the same way.
 */
export function creatorDatabaseQuery(
  filters: CreatorFilterState,
  page: number,
): Record<string, string> {
  const query: Record<string, string> = {};
  if (filters.q) query.q = filters.q;
  if (filters.contractStatus !== "all") query.contractStatus = filters.contractStatus;
  if (filters.productivity !== "all") query.productivity = filters.productivity;
  if (page > 1) query.page = String(page);
  return query;
}

/**
 * `return` read the way the roster reads its own address, and written again from what was
 * read. A key the roster does not know, a value it cannot hold or a whole address typed in its
 * place is left behind, so the way back can only ever name a roster view (OWASP A01).
 */
function readCreatorDatabaseView(raw: string): string {
  const given = new URLSearchParams(raw);
  const params = {
    q: given.get("q") ?? undefined,
    contractStatus: given.get("contractStatus") ?? undefined,
    productivity: given.get("productivity") ?? undefined,
    page: given.get("page") ?? undefined,
  };

  return new URLSearchParams(
    creatorDatabaseQuery(parseFilters(params), parsePage(params).page),
  ).toString();
}

/** The way back: the roster view the admin came from, or the bare roster. */
export function creatorDatabaseHref(back: string | undefined): string {
  return back ? `${CREATOR_DATABASE_BASE}?${back}` : CREATOR_DATABASE_BASE;
}

/** The creator's own address; the id is encoded so it can never step out of its segment. */
export function creatorDetailBase(creatorId: string): string {
  return `/admin/creators/${encodeURIComponent(creatorId)}`;
}

/**
 * The non-default parts of the state as query parameters, in a stable order. Defaults are
 * left out so the bare view stays at the bare address.
 */
export function buildCreatorDetailQuery(state: CreatorDetailParams): Record<string, string> {
  const query: Record<string, string> = {};
  if (state.contract) query.contract = state.contract;
  if (state.type.length > 0) query.type = state.type.join(",");
  if (state.status.length > 0) query.status = state.status.join(",");
  if (state.page > 1) query.page = String(state.page);
  if (state.back) query.return = state.back;
  return query;
}

/** The page's own address for a state: the bare path, or the path with its query. */
export function creatorDetailHref(creatorId: string, state: CreatorDetailParams): string {
  const base = creatorDetailBase(creatorId);
  const search = new URLSearchParams(buildCreatorDetailQuery(state)).toString();
  return search ? `${base}?${search}` : base;
}

/**
 * Whether a filter narrowed the table, which changes what an empty table means. Choosing a
 * contract or a page narrows nothing.
 */
export function isCreatorDetailFiltered(state: CreatorDetailParams): boolean {
  return state.type.length > 0 || state.status.length > 0;
}

/** A filter change: the patch applies and the old page number no longer means anything. */
export function creatorDetailAfterFilterChange(
  state: CreatorDetailParams,
  patch: Partial<Pick<CreatorDetailParams, "type" | "status">>,
): CreatorDetailParams {
  return { ...state, ...patch, page: 1 };
}

/**
 * Another contract: its table opens unfiltered on its first page, as the prototype's period
 * tabs do. The filters and the page belonged to the contract that was left behind; the way
 * back to the roster did not.
 */
export function creatorDetailAfterContractChange(
  state: CreatorDetailParams,
  contract: string,
): CreatorDetailParams {
  return {
    ...DEFAULT_CREATOR_DETAIL_PARAMS,
    contract,
    ...(state.back ? { back: state.back } : {}),
  };
}
