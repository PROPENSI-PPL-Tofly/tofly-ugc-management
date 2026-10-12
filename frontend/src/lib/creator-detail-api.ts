// The translation between the Creator Detail page and the two endpoints it reads (subtask 4.1):
// GET /creators/:id for the creator and their contract periods, and GET /contents?contract=
// for one page of the open period's content. The page's state goes out as the query the API
// reads, and the API's answers come back as the profile, the period tabs and the rows the page
// renders. Everything that knows the API's shape lives here, so either side can change without
// the other moving.
//
// Pure module: no next/headers, so it runs anywhere.

import type { RawContentList, RawContentListItem } from "./content-list-api";
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

/**
 * One contract period as GET /creators/:id sends it. The API answers with more (progress,
 * performance, each content in full); only what the page reads is named here.
 */
export interface RawCreatorPeriod {
  id: string;
  /** 1 for the first contract, counting up with every renewal. */
  periodNumber: number;
  type: ContractType;
  /** Plain calendar day, "YYYY-MM-DD". */
  startDate: string;
  endDate: string;
  status: PeriodStatus;
  contentQuota: number;
  daysBetween: number;
  /** Every content of the period, unpaged; the page only counts them by type. */
  contents: { type: ContentType }[];
}

export interface RawCreatorDetail {
  id: string;
  name: string;
  email: string;
  socials: Partial<Record<"instagram" | "tiktok", string>>;
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

  query.set("contract", contractId);
  for (const type of new Set(state.type)) query.append("type", type);
  for (const status of new Set(state.status)) query.append("status", status);

  // The API counts on a page number whichever page is asked for, page one included.
  query.set("page", String(state.page));

  return query;
}

function toProfile(raw: RawCreatorDetail): CreatorProfile {
  const socials: CreatorProfile["socials"] = {};
  if (raw.socials.instagram) socials.instagram = raw.socials.instagram;
  if (raw.socials.tiktok) socials.tiktok = raw.socials.tiktok;

  return { id: raw.id, name: raw.name, email: raw.email, socials };
}

function toPeriod(period: RawCreatorPeriod): CreatorPeriod {
  const planned = period.contents.filter((content) => content.type === "evergreen").length;

  return {
    contractId: period.id,
    periodNumber: period.periodNumber,
    type: period.type,
    startDate: period.startDate,
    endDate: period.endDate,
    status: period.status,
    contentQuota: period.contentQuota,
    // The quota less the Evergreen already planned; never below nothing.
    remainingEvergreenQuota: Math.max(period.contentQuota - planned, 0),
    daysBetween: period.daysBetween,
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
  };
}
