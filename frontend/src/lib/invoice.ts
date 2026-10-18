// The Rate & Invoicing table's own contract (PBI-8, subtask 8.4). The page lives in the URL:
// the search word, the contract and invoice filters and the page number are parameters, so a
// view can be linked, bookmarked and reloaded. Pure module — no next/headers — so client
// components can share it.

import { formatDeduction, formatRupiah } from "./format";
import { oneOf, pageNumber, single, type SearchParams } from "./search-params";

/** The table shows ten creators a page, as the prototype pages it. */
export const INVOICE_PAGE_SIZE = 10;

/** The list's own address. */
export const INVOICE_PATH = "/admin/invoicing";

/** What the ⓘ beside Total says: how the total is made, and that a bonus still waiting is not in it. */
export const TOTAL_FORMULA =
  "Total = Fixed Rate + Fee Konten Tambahan + Bonus Performa − Penalti. Bonus yang masih menunggu data belum dihitung.";

/**
 * The orders the table can be read in. "action" is the default: ended contracts first, as their
 * invoices are ready to finalize, then running, then not started.
 */
export const INVOICE_SORT_KEYS = ["action", "name", "fixed", "penalty", "total"] as const;

export type InvoiceSortKey = (typeof INVOICE_SORT_KEYS)[number];

export type InvoiceSortOrder = "asc" | "desc";

/** The longest search word GET /invoices reads; a longer one would be refused with a 400. */
export const MAX_INVOICE_SEARCH_LENGTH = 100;

/** An amount of nothing to pay reads as a dash, not as a zero. */
export const DASH = "–";

/** The invoice pipeline, worded as the prototype words it, in the order it walks. */
export const INVOICE_STATUS_LABELS = {
  accruing: "Berjalan",
  finalized: "Invoice Terkirim",
  creator_acked: "Perlu Bukti Bayar",
  payment_uploaded: "Bukti Bayar Terkirim",
  paid: "Paid",
} as const;

export type InvoiceStatus = keyof typeof INVOICE_STATUS_LABELS;

export const INVOICE_STATUSES = Object.keys(INVOICE_STATUS_LABELS) as InvoiceStatus[];

/** A contract's place in its lifecycle, the words every admin view uses. */
export const CONTRACT_STATUS_LABELS = {
  active: "Aktif",
  upcoming: "Belum Dimulai",
  expired: "Berakhir",
} as const;

export type ContractStatus = keyof typeof CONTRACT_STATUS_LABELS;

export const CONTRACT_STATUSES = Object.keys(CONTRACT_STATUS_LABELS) as ContractStatus[];

/**
 * One creator's running invoice, in the page's own names. Components read these and never the
 * API's answer, so a change to the endpoint stops at invoice-api.
 */
export interface InvoiceRow {
  creatorId: string;
  creatorName: string;
  contractStatus: ContractStatus;

  fixedAmount: number;
  /** Konten Tambahan: what the extra content earned on top of the fixed rate. */
  extraAmount: number;
  /**
   * The performance bonus, or null while its data is not in yet (PBI-19). A null is shown as
   * "Menunggu data" and never as a zero — zero would claim a bonus was measured at nothing.
   */
  bonusAmount: number | null;
  penaltyAmount: number;
  /**
   * Final Rate as the backend works it out: the running total, held at zero when the penalty
   * outweighs the pay, with a bonus still waiting for data counted as nothing yet.
   */
  totalAmount: number;
  /** True when the penalty outweighed the pay and the backend held the total at zero. */
  floored: boolean;
  invoiceStatus: InvoiceStatus;
}

/** What the page says about every invoice, not only the ones on this page. */
export interface InvoiceSummary {
  /** What every invoice the filters keep adds up to. */
  total: number;
  /** Running invoices across the whole roster: what a formula change recalculates. */
  runningInvoices: number;
  formulaSet: boolean;
}

/** One page of the table, with the whole list's count so the pagination can name the pages. */
export interface InvoiceList {
  rows: InvoiceRow[];
  page: number;
  total: number;
  totalPages: number;
  summary: InvoiceSummary;
}

export interface InvoiceParams {
  q: string;
  contract: ContractStatus | "all";
  status: InvoiceStatus | "all";
  sort: InvoiceSortKey;
  order: InvoiceSortOrder;
  page: number;
}

export const DEFAULT_INVOICE_PARAMS: InvoiceParams = {
  q: "",
  contract: "all",
  status: "all",
  sort: "action",
  order: "asc",
  page: 1,
};

/**
 * The URL's values as the page's state, every one checked. The address bar takes anything, so a
 * status from another world or a page of zero falls back to the default here rather than
 * reaching an API that would only answer 400 (OWASP A03).
 */
export function parseInvoiceParams(params: SearchParams): InvoiceParams {
  return {
    q: single(params.q).trim().slice(0, MAX_INVOICE_SEARCH_LENGTH).trim(),
    contract: oneOf(["all", ...CONTRACT_STATUSES], single(params.contract), "all"),
    status: oneOf(["all", ...INVOICE_STATUSES], single(params.status), "all"),
    sort: oneOf(INVOICE_SORT_KEYS, single(params.sort), "action"),
    order: oneOf(["asc", "desc"] as const, single(params.order), "asc"),
    page: pageNumber(params.page),
  };
}

/**
 * The non-default parts of the state as query parameters, in a stable order. Defaults are left
 * out so the bare list stays at the bare address, and every page link keeps what was filtered.
 */
export function buildInvoiceQuery(state: InvoiceParams): Record<string, string> {
  const query: Record<string, string> = {};
  if (state.q) query.q = state.q;
  if (state.contract !== "all") query.contract = state.contract;
  if (state.status !== "all") query.status = state.status;
  if (state.sort !== "action") query.sort = state.sort;
  if (state.order !== "asc") query.order = state.order;
  if (state.page > 1) query.page = String(state.page);
  return query;
}

/**
 * The order after a column is pressed: the same column turns around; another starts the way it
 * reads best, names A to Z and amounts largest first.
 */
export function nextInvoiceSort(
  current: { sort: InvoiceSortKey; order: InvoiceSortOrder },
  key: InvoiceSortKey,
): { sort: InvoiceSortKey; order: InvoiceSortOrder } {
  if (current.sort === key) return { sort: key, order: current.order === "asc" ? "desc" : "asc" };
  return { sort: key, order: key === "name" || key === "action" ? "asc" : "desc" };
}

/**
 * Where the CSV of what is on show downloads from: the same filters and order, every page, through
 * the app's own /api so the session stays a same-origin cookie.
 */
export function invoiceExportHref(state: InvoiceParams): string {
  // Page one leaves the page out of the query; the export is every page.
  const search = new URLSearchParams(buildInvoiceQuery({ ...state, page: 1 })).toString();
  return search ? `/api/invoices/export?${search}` : "/api/invoices/export";
}

/** The list's own address for a state: the bare path, or the path with its query. */
export function invoiceHref(state: InvoiceParams): string {
  const search = new URLSearchParams(buildInvoiceQuery(state)).toString();
  return search ? `${INVOICE_PATH}?${search}` : INVOICE_PATH;
}

/** An amount as the table writes it: a dash where there is nothing to pay. */
export function amountLabel(amount: number): string {
  return amount === 0 ? DASH : formatRupiah(amount);
}

/** The performance bonus: "Menunggu data" until the data arrives, never a zero. */
export function bonusLabel(amount: number | null): string {
  return amount === null ? "Menunggu data" : amountLabel(amount);
}

/** A penalty is what is taken off, so it reads as a minus. */
export function penaltyLabel(amount: number): string {
  return amount === 0 ? DASH : formatDeduction(amount);
}

/**
 * Final Rate = Fixed Rate + Konten Tambahan + Bonus − Penalti, as the tooltip on the table says,
 * taken from the backend rather than added up again, so it can never disagree with the invoice.
 * While the bonus waits for its data the total runs without it; the Bonus cell says so.
 */
export function finalLabel(row: InvoiceRow): string {
  // A total the penalty used up is a real Rp0, not "nothing billed": it reads as an amount.
  return row.floored ? formatRupiah(0) : amountLabel(row.totalAmount);
}
