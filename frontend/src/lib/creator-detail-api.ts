// The translation between the Creator Detail page and GET /creators/:id (subtask 4.1): the
// page's state as the query the API reads, and the API's answer as the profile, the period
// tabs and the open period's rows the page renders. Everything that knows the API's shape
// lives here, so either side can change without the other moving.
//
// Pure module: no next/headers, so it runs anywhere.

import type { ContentType } from "./contents";
import type { ContractType } from "./creator-form";
import type {
  CreatorContentRow,
  CreatorDetailParams,
  CreatorDetailView,
  CreatorPeriod,
  CreatorProfile,
  PeriodStatus,
} from "./creator-detail";
import type { ContentStatus, ContentTag } from "./creators";

/** One content as the API sends it. */
export interface RawCreatorContent {
  id: string;
  name: string;
  type: ContentType;
  /** Plain calendar day, "YYYY-MM-DD". */
  deadline: string;
  status: ContentStatus;
  tags: ContentTag[];
  revisionCount: number;
}

/** One page of a contract's content, with the count behind it. */
export interface RawCreatorContents {
  items: RawCreatorContent[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface RawCreatorContract {
  id: string;
  type: ContractType;
  startDate: string;
  endDate: string;
  status: PeriodStatus;
  /** A decimal column: a number, or the text the database driver writes it as. */
  fixedRate: number | string;
  contentQuota: number;
  remainingEvergreenQuota: number;
  daysBetween: number;
  contents: RawCreatorContents;
}

export interface RawCreatorDetail {
  id: string;
  name: string;
  email: string;
  instagramUsername: string | null;
  tiktokUsername: string | null;
  /** Newest first. */
  contracts: RawCreatorContract[];
}

/**
 * The page's state as the query GET /creators/:id reads. A multi-select goes out as one
 * parameter per pick, which is how the API reads a list. Every value was checked when the
 * address was parsed, so nothing typed into it reaches the API unread (OWASP A03).
 */
export function toCreatorDetailQuery(state: CreatorDetailParams): URLSearchParams {
  const query = new URLSearchParams();

  if (state.contract) query.set("contract", state.contract);
  for (const type of new Set(state.type)) query.append("type", type);
  for (const status of new Set(state.status)) query.append("status", status);

  // The API counts on a page number whichever page is asked for, page one included.
  query.set("page", String(state.page));

  return query;
}

/** An amount of money as a number, or null for anything that does not read as one. */
function amount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  // Number("") is 0: an empty answer would read as a rate of nothing rather than as no rate.
  if (typeof value !== "string" || value.trim() === "") return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toProfile(raw: RawCreatorDetail): CreatorProfile {
  const socials: CreatorProfile["socials"] = {};
  if (raw.instagramUsername) socials.instagram = raw.instagramUsername;
  if (raw.tiktokUsername) socials.tiktok = raw.tiktokUsername;

  return { id: raw.id, name: raw.name, email: raw.email, socials };
}

function toRow({ id, ...row }: RawCreatorContent): CreatorContentRow {
  return { contentId: id, ...row };
}

/**
 * The API's answer under the page's names. The open period is the one the address names when
 * it is this creator's, and the newest otherwise: an old link, or an id typed by hand, shows
 * the creator's current contract rather than an empty page.
 */
export function toCreatorDetailView(
  raw: RawCreatorDetail,
  state: CreatorDetailParams,
): CreatorDetailView {
  // Contracts arrive newest first, so the last one is the first period.
  const periods = raw.contracts.map(
    (contract, index): CreatorPeriod => ({
      contractId: contract.id,
      periodNumber: raw.contracts.length - index,
      type: contract.type,
      startDate: contract.startDate,
      endDate: contract.endDate,
      status: contract.status,
      fixedRate: amount(contract.fixedRate),
      contentQuota: contract.contentQuota,
      remainingEvergreenQuota: contract.remainingEvergreenQuota,
      daysBetween: contract.daysBetween,
    }),
  );

  const named = state.contract?.toLowerCase();
  const found = raw.contracts.findIndex((contract) => contract.id.toLowerCase() === named);
  const open = raw.contracts.at(Math.max(found, 0));
  const selected = periods.at(Math.max(found, 0)) ?? null;

  return {
    creator: toProfile(raw),
    periods,
    selected,
    rows: open ? open.contents.items.map(toRow) : [],
    page: open?.contents.page ?? 1,
    total: open?.contents.total ?? 0,
    // An empty table is still one page: the pagination stays on show and needs a page to name.
    totalPages: Math.max(1, open?.contents.totalPages ?? 1),
  };
}
