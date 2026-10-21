// The translation between the Creator Detail page and the two endpoints it reads (subtask 4.1):
// GET /creators/:id for the creator and their contract periods, and GET /contents?contract=
// for one page of the open period's content. The page's state goes out as the query the API
// reads, and the API's answers come back as the profile, the period tabs and the rows the page
// renders. Everything that knows the API's shape lives here, so either side can change without
// the other moving.
//
// Pure module: no next/headers, so it runs anywhere.

import {
  API_OVERDUE,
  API_SORT,
  API_TAB,
  MAX_SEARCH_LENGTH,
  toTabCounts,
  type RawContentList,
  type RawContentListItem,
} from "./content-list-api";
import type {
  CreatorContentRow,
  CreatorDetailParams,
  CreatorDetailView,
  CreatorPeriod,
  CreatorProfile,
} from "./creator-detail";
import type { ContractPeriod } from "./creators";
import type { InvoiceStatus } from "./invoice";

/**
 * One contract period as GET /creators/:id sends it, picked from the mirror of the backend's
 * DTO rather than spelled out again: a field the API drops or renames fails to compile here,
 * not at runtime on the page. The API answers with more (fixed rate, progress, performance);
 * only what the page reads is picked.
 */
export type RawCreatorPeriod = Pick<
  ContractPeriod,
  | "id"
  | "periodNumber"
  | "type"
  | "startDate"
  | "endDate"
  | "status"
  | "contentQuota"
  | "daysBetween"
  | "remainingEvergreenQuota"
  | "progress"
  | "performance"
>;

/** The open period's invoice as GET /invoices/:creatorId?contract= answers it, cut to the card's needs. */
export interface RawPeriodInvoice {
  total: number;
  floored: boolean;
  invoiceStatus: InvoiceStatus;
}

export interface RawCreatorDetail {
  id: string;
  name: string;
  email: string;
  socials: Partial<Record<"instagram" | "tiktok", string>>;
  accessRevokeDate: string | null;
  /** Oldest first. */
  contractHistory: RawCreatorPeriod[];
}

/**
 * The contract whose content the page shows: the one the address names when it is this
 * creator's, and their newest otherwise. An old link, or an id typed by hand, shows the current
 * contract rather than an empty page, and never another creator's content (OWASP A01). Null
 * for a creator without a contract.
 */
export function openContractId(raw: RawCreatorDetail, state: CreatorDetailParams): string | null {
  const named = state.contract?.toLowerCase();
  const found = raw.contractHistory.find((period) => period.id.toLowerCase() === named);

  // Periods arrive oldest first, so the last one is the newest.
  return (found ?? raw.contractHistory.at(-1))?.id ?? null;
}

/**
 * The page's state as the query GET /contents reads, narrowed to one contract. A multi-select
 * goes out as one parameter per pick, which is how the API reads a list. Every value was
 * checked when the address was parsed, and the contract is one the API itself listed for this
 * creator, so nothing typed into the address reaches the API unread (OWASP A03).
 */
export function toCreatorContentsQuery(
  contractId: string,
  state: CreatorDetailParams,
): URLSearchParams {
  const query = new URLSearchParams();

  // In the API's own words, from the tables content-list-api keeps for the Content Plan, so a
  // parameter renamed there is renamed here too and no filter silently narrows nothing.
  query.set("contract", contractId);
  if (state.tab !== "all") query.set("tab", API_TAB[state.tab]);
  if (state.q) query.set("q", state.q.slice(0, MAX_SEARCH_LENGTH));
  for (const type of new Set(state.type)) query.append("type", type);
  for (const status of new Set(state.status)) query.append("status", status);

  const overdue = API_OVERDUE[state.overdue];
  if (overdue) query.set("overdue", overdue);

  // Always sent: the API's own default is the latest first, the page's the nearest.
  query.set("sort", API_SORT[state.sort]);

  // The API counts on a page number whichever page is asked for, page one included.
  query.set("page", String(state.page));

  return query;
}

/** The most rows GET /contents hands out in one request. */
export const CALENDAR_PAGE_SIZE = 50;

/**
 * One page of the open period for its calendar: everything in it, unfiltered, nearest deadline
 * first. A month needs every content of the period, not the table's page of ten.
 */
export function toCreatorCalendarQuery(contractId: string, page: number): URLSearchParams {
  return new URLSearchParams({
    contract: contractId,
    sort: API_SORT.asc,
    pageSize: String(CALENDAR_PAGE_SIZE),
    page: String(page),
  });
}

function toProfile(raw: RawCreatorDetail): CreatorProfile {
  const socials: CreatorProfile["socials"] = {};
  if (raw.socials.instagram) socials.instagram = raw.socials.instagram;
  if (raw.socials.tiktok) socials.tiktok = raw.socials.tiktok;

  return {
    id: raw.id,
    name: raw.name,
    email: raw.email,
    socials,
    // An answer from before the field was sent reads as no revoke set.
    accessRevokeDate: raw.accessRevokeDate ?? null,
  };
}

function toPeriod(period: RawCreatorPeriod): CreatorPeriod {
  // The API counts the room left; it no longer lists a period's contents to count them here.
  // Kept within the quota, so a stray number never opens a slot the contract does not have.
  const remaining = Math.min(Math.max(period.remainingEvergreenQuota, 0), period.contentQuota);

  return {
    contractId: period.id,
    periodNumber: period.periodNumber,
    type: period.type,
    startDate: period.startDate,
    endDate: period.endDate,
    status: period.status,
    contentQuota: period.contentQuota,
    // What Tambah Konten checks against the quota: full exactly when no room is left.
    evergreenCount: period.contentQuota - remaining,
    remainingEvergreenQuota: remaining,
    daysBetween: period.daysBetween,
    progress: period.progress,
    performance: period.performance,
  };
}

/** A row of the content list under the page's names; the creator is the page's own. */
function toRow(item: RawContentListItem): CreatorContentRow {
  return {
    contentId: item.id,
    name: item.name,
    type: item.type,
    deadline: item.deadline,
    status: item.status,
    tags: item.tags,
    revisionCount: item.revisionCount,
  };
}

/**
 * The API's answers under the page's names. `contents` is the open period's page of the
 * content list, or null for a creator without a contract, who has none to list; `calendar` is
 * every content of that period, for its month view.
 */
export function toCreatorDetailView(
  raw: RawCreatorDetail,
  contents: RawContentList | null,
  state: CreatorDetailParams,
  calendar: readonly RawContentListItem[] = [],
  invoice: RawPeriodInvoice | null = null,
): CreatorDetailView {
  // The tabs and the profile read the periods newest first.
  const periods = raw.contractHistory.map(toPeriod).reverse();
  const open = openContractId(raw, state);
  // An empty table is still one page: the pagination stays on show and needs a page to name.
  const totalPages = Math.max(1, contents?.totalPages ?? 1);

  return {
    creator: toProfile(raw),
    periods,
    selected: periods.find((period) => period.contractId === open) ?? null,
    rows: contents ? contents.items.map(toRow) : [],
    // The API answers a page past the end with the number it was asked for; the page shown is
    // never past the last one.
    page: Math.min(contents?.page ?? 1, totalPages),
    total: contents?.total ?? 0,
    totalPages,
    counts: toTabCounts(contents ?? { tabCounts: {} as RawContentList["tabCounts"] }),
    calendar: calendar.map(toRow),
    // A total the penalty used up is a real Rp0, as the backend holds it.
    earnings: invoice ? { amount: invoice.floored ? 0 : invoice.total, status: invoice.invoiceStatus } : null,
  };
}
