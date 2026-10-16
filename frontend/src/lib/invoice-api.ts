// The translation between the Rate & Invoicing table and the endpoint that answers it (subtask
// 8.3). The page's state goes out as the query the API reads, and the API's answer comes back as
// the rows the table renders. Everything that knows the API's shape lives here, so either side
// can change without the other moving.

import {
  INVOICE_PAGE_SIZE,
  type ContractStatus,
  type InvoiceList,
  type InvoiceParams,
  type InvoiceRow,
  type InvoiceStatus,
} from "./invoice";

/** One creator's running invoice, as GET /invoices answers it. */
export interface RawInvoiceRow {
  creatorId: string;
  name: string;
  contractStatus: ContractStatus;
  fixedAmount: number;
  /** Konten Tambahan. */
  extraAmount: number;
  /** null while the performance bonus waits for PBI-19's data; never a zero instead. */
  bonusAmount: number | null;
  penaltyAmount: number;
  invoiceStatus: InvoiceStatus;
}

export interface RawInvoiceList {
  items: RawInvoiceRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** The page's state as the query GET /reads: the filters that are applied, the page and its size. */
export function toInvoiceListQuery(state: InvoiceParams): URLSearchParams {
  const query = new URLSearchParams();
  if (state.q) query.set("q", state.q);
  if (state.contract !== "all") query.set("contract", state.contract);
  if (state.status !== "all") query.set("status", state.status);
  query.set("page", String(state.page));
  query.set("pageSize", String(INVOICE_PAGE_SIZE));
  return query;
}

function toInvoiceRow(raw: RawInvoiceRow): InvoiceRow {
  return {
    creatorId: raw.creatorId,
    creatorName: raw.name,
    contractStatus: raw.contractStatus,
    fixedAmount: raw.fixedAmount,
    extraAmount: raw.extraAmount,
    bonusAmount: raw.bonusAmount,
    penaltyAmount: raw.penaltyAmount,
    invoiceStatus: raw.invoiceStatus,
  };
}

/**
 * The API's answer under the page's names. An empty list is still one page: the pagination
 * stays on show and needs a page to name.
 */
export function toInvoiceList(raw: RawInvoiceList): InvoiceList {
  const totalPages = Math.max(1, raw.totalPages);

  return {
    rows: raw.items.map(toInvoiceRow),
    page: Math.min(raw.page, totalPages),
    total: raw.total,
    totalPages,
  };
}
