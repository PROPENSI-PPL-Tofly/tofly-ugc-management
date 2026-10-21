// The URL contract of the Creator Detail page (PBI 4, subtask 4.2). The page lives in the URL:
// which contract is open, the table's filters and its page number are parameters, so a view can
// be linked, bookmarked and reloaded. Pure module — no next/headers — so client components can
// share it.

import type { Tone } from "@/components/ui/pill";
import { CONTENT_STATUS_LABELS, CONTENT_TYPE_LABELS } from "./content-labels";
import {
  CONTENT_PLAN_TAB_KEYS,
  type ContentPlanCounts,
  type ContentPlanTab,
  type DeadlineSort,
  type OverdueFilter,
} from "./content-plan";
import type { ContentType } from "./contents";
import type { ContractType } from "./creator-form";
import type { ContentStatus, ContentTag } from "./creators";
import { formatDate } from "./format";
import { listOf, oneOf, pageNumber, single, type SearchParams } from "./search-params";

/** A contract's table shows ten rows a page, as 4.1 serves them. */
export const CREATOR_DETAIL_PAGE_SIZE = 10;

// Read off the label maps, which must name every status and type to compile, so a status added
// to the lifecycle is a filter choice here without being listed a second time.
const CONTENT_STATUSES = Object.keys(CONTENT_STATUS_LABELS) as ContentStatus[];
const CONTENT_TYPES = Object.keys(CONTENT_TYPE_LABELS) as ContentType[];
const OVERDUE_FILTERS: readonly OverdueFilter[] = ["all", "yes", "no"];
const SORT_DIRECTIONS: readonly DeadlineSort[] = ["asc", "desc"];

/**
 * Nearest deadline first, as the per-creator Content Plan this page replaced listed it: what is
 * due today or overdue belongs on the first page of one creator's period. The header turns it.
 */
export const CREATOR_DETAIL_DEFAULT_SORT: DeadlineSort = "asc";

/** What an id looks like to the API: 8-4-4-4-12 hexadecimal, and nothing more. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a value from the address could be an id at all, before anything is asked with it. */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}

/**
 * The table's state, in the Content Plan's own words (tab, q, overdue, sort), so the two pages
 * that list content read and link the same way.
 */
export interface CreatorDetailParams {
  /** The contract whose content is on show; null for the newest one. */
  contract: string | null;
  tab: ContentPlanTab;
  q: string;
  type: ContentType[];
  status: ContentStatus[];
  overdue: OverdueFilter;
  sort: DeadlineSort;
  page: number;
}

export const DEFAULT_CREATOR_DETAIL_PARAMS: CreatorDetailParams = {
  contract: null,
  tab: "all",
  q: "",
  type: [],
  status: [],
  overdue: "all",
  sort: CREATOR_DETAIL_DEFAULT_SORT,
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
  /** The day the creator can no longer sign in, "YYYY-MM-DD"; null when none is set. */
  accessRevokeDate: string | null;
}

/**
 * Whether the creator can sign in. Sign-in reads only the revoke day, never the contract's
 * dates, so this does too: a creator between contracts still gets in.
 */
export type AccessState = "active" | "scheduled" | "revoked";

export const ACCESS_STATE_LABELS: Record<AccessState, string> = {
  active: "Aktif",
  scheduled: "Aktif",
  revoked: "Dicabut",
};

/** Green while it lasts, amber once its end is set, red when it is over; never colour alone. */
export const ACCESS_STATE_TONES: Record<AccessState, Tone> = {
  active: "green",
  scheduled: "amber",
  revoked: "red",
};

export interface CreatorAccess {
  state: AccessState;
  /** The day that explains the state, in words; null when there is nothing to add. */
  note: string | null;
}

/**
 * The creator's access as the profile words it. The revoke day itself already counts as
 * revoked, as sign-in counts it. A revoke before the contract's last day is said to have cut
 * it short, so the admin reads that the contract did not simply run out.
 */
export function creatorAccess(
  revokeDate: string | null,
  contractEnd: string | null,
  today: string,
): CreatorAccess {
  if (revokeDate === null) return { state: "active", note: null };
  if (revokeDate > today) return { state: "scheduled", note: `Dicabut mulai ${formatDate(revokeDate)}` };

  const cutShort =
    contractEnd !== null && revokeDate < contractEnd
      ? `, sebelum kontrak berakhir (${formatDate(contractEnd)})`
      : "";

  return { state: "revoked", note: `Sejak ${formatDate(revokeDate)}${cutShort}` };
}

/** A contract always has dates, so it is running, over or yet to start. */
export type PeriodStatus = "active" | "expired" | "upcoming";

/** Worded as the prototype words them, on the profile and on every period tab. */
export const PERIOD_STATUS_LABELS: Record<PeriodStatus, string> = {
  active: "Aktif",
  expired: "Berakhir",
  upcoming: "Belum Dimulai",
};

/** The dot beside the label, as Creator Database colours a contract; never the only signal. */
export const PERIOD_STATUS_TONES: Record<PeriodStatus, Tone> = {
  active: "green",
  expired: "red",
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
  /** How much of the open period sits in each tab, under the search and filters. */
  counts: ContentPlanCounts;
  /** The open period's whole content, unfiltered and in deadline order, for its calendar. */
  calendar: CreatorContentRow[];
}

/**
 * The URL's values as the page's state, every one checked. The address bar takes anything, so
 * a contract that is not an id, a status from another world or a page of zero falls back to the
 * default here rather than reaching the API (OWASP A03).
 */
export function parseCreatorDetailParams(params: SearchParams): CreatorDetailParams {
  const contract = single(params.contract);

  return {
    contract: isUuid(contract) ? contract : null,
    tab: oneOf(CONTENT_PLAN_TAB_KEYS, single(params.tab), "all"),
    q: single(params.q).trim(),
    type: listOf(CONTENT_TYPES, params.type),
    status: listOf(CONTENT_STATUSES, params.status),
    overdue: oneOf(OVERDUE_FILTERS, single(params.overdue), "all"),
    sort: oneOf(SORT_DIRECTIONS, single(params.sort), CREATOR_DETAIL_DEFAULT_SORT),
    page: pageNumber(params.page),
  };
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
  if (state.tab !== "all") query.tab = state.tab;
  if (state.q) query.q = state.q;
  if (state.type.length > 0) query.type = state.type.join(",");
  if (state.status.length > 0) query.status = state.status.join(",");
  if (state.overdue !== "all") query.overdue = state.overdue;
  if (state.sort !== CREATOR_DETAIL_DEFAULT_SORT) query.sort = state.sort;
  if (state.page > 1) query.page = String(state.page);
  return query;
}

/** The page's own address for a state: the bare path, or the path with its query. */
export function creatorDetailHref(creatorId: string, state: CreatorDetailParams): string {
  const base = creatorDetailBase(creatorId);
  const search = new URLSearchParams(buildCreatorDetailQuery(state)).toString();
  return search ? `${base}?${search}` : base;
}

/**
 * Whether a search or a filter narrowed the table, which changes what an empty table means.
 * Choosing a contract, a tab, an order or a page narrows nothing.
 */
export function isCreatorDetailFiltered(state: CreatorDetailParams): boolean {
  return (
    state.q !== "" || state.type.length > 0 || state.status.length > 0 || state.overdue !== "all"
  );
}

/** A filter change: the patch applies and the old page number no longer means anything. */
export function creatorDetailAfterFilterChange(
  state: CreatorDetailParams,
  patch: Partial<Pick<CreatorDetailParams, "type" | "status">>,
): CreatorDetailParams {
  return { ...state, ...patch, page: 1 };
}

/**
 * A tab change, as on the Content Plan: the search and the filters carry over, but the status
 * picks, the order and the page belong to the tab that was left behind.
 */
export function creatorDetailAfterTabChange(
  state: CreatorDetailParams,
  tab: ContentPlanTab,
): CreatorDetailParams {
  return { ...state, tab, status: [], sort: CREATOR_DETAIL_DEFAULT_SORT, page: 1 };
}

/**
 * Another contract: its table opens unfiltered on its first page, as the prototype's period
 * tabs do. The filters and the page belonged to the contract that was left behind.
 */
export function creatorDetailAfterContractChange(
  _state: CreatorDetailParams,
  contract: string,
): CreatorDetailParams {
  return { ...DEFAULT_CREATOR_DETAIL_PARAMS, contract };
}
