// The translation between the Creator Detail page and the two endpoints it reads (subtask 4.1):
// GET /creators/:id for the creator and their contract periods, and GET /contents?contract=
// for one page of the open period's content. The page's state goes out as the query the API
// reads, and the API's answers come back as the profile, the period tabs and the rows the page
// renders. Everything that knows the API's shape lives here, so either side can change without
// the other moving.
//
// Pure module: no next/headers, so it runs anywhere.

import { toContentListQuery, type RawContentList, type RawContentListItem } from "./content-list-api";
import { DEFAULT_CONTENT_PLAN_PARAMS, type ContentPlanParams } from "./content-plan";
import type {
  CreatorContentRow,
  CreatorDetailParams,
  CreatorDetailView,
  CreatorPeriod,
  CreatorProfile,
} from "./creator-detail";
import type { ContractPeriod } from "./creators";
import type { RawInvoiceDetail } from "./invoice-api";
import { jakartaDay } from "./format";
import { readConnections } from "./social-connection";

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

/** The invoice card needs only the endpoint's total, floor and status. */
export type RawPeriodInvoice = Pick<RawInvoiceDetail, "total" | "floored" | "invoiceStatus">;

export interface RawCreatorDetail {
  id: string;
  name: string;
  email: string;
  socials: Partial<Record<"instagram" | "tiktok", string>>;
  // Sent by 19.3; read only through readConnections.
  socialConnections?: unknown;
  accessRevokeDate?: string | null;
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
  today: string = jakartaDay(),
): URLSearchParams {
  // Use the Content Plan adapter so its tab names, search cap, overdue logic, status/type
  // filtering, and sort mapping remain the single source of API vocabulary.
  const planState: ContentPlanParams = {
    ...DEFAULT_CONTENT_PLAN_PARAMS,
    tab: state.tab,
    page: state.page,
    q: state.q,
    type: state.type,
    status: state.status,
    overdue: state.overdue,
    sort: state.sort,
  };
  const translated = toContentListQuery(planState, today);
  const query = new URLSearchParams({ contract: contractId });
  for (const [key, value] of translated) query.append(key, value);
  return query;
}

/** All period rows, in deadline order, for the calendar's month grid. */
export const CREATOR_CALENDAR_PAGE_SIZE = 50;

export function toCreatorCalendarQuery(
  contractId: string,
  page: number,
  today: string = jakartaDay(),
): URLSearchParams {
  const translated = toContentListQuery(
    { ...DEFAULT_CONTENT_PLAN_PARAMS, sort: "asc", page },
    today,
  );
  const query = new URLSearchParams({
    contract: contractId,
    sort: translated.get("sort") ?? "deadline_asc",
    pageSize: String(CREATOR_CALENDAR_PAGE_SIZE),
    page: String(page),
  });
  return query;
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
    accessRevokeDate: raw.accessRevokeDate,
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
 * The API's two answers under the page's names. `contents` is the open period's page of the
 * content list, or null for a creator without a contract, who has none to list.
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
    counts: {
      all: contents?.tabCounts?.all ?? 0,
      action: contents?.tabCounts?.needs_approval ?? 0,
      waiting: contents?.tabCounts?.waiting_creator ?? 0,
      done: contents?.tabCounts?.done ?? 0,
    },
    calendar: calendar.map(toRow),
    earnings: invoice
      ? { amount: invoice.floored ? 0 : invoice.total, status: invoice.invoiceStatus }
      : null,
    connections: readConnections(raw.socialConnections),
  };
}
