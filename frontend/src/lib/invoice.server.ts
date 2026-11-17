// Server-side only: the Rate & Invoicing table's list, fetched while the page renders. It reads
// the browser's session through next/headers, which client components cannot import, so it
// lives apart from the shared invoice module.
//
// The endpoint is GET /invoices (subtask 8.3). Its query and its answer are spelled in the API's
// own words, so both pass through invoice-api, the one module that knows them. Single
// Responsibility: this module fetches and invoice-api translates.

import { backendGet } from "./backend.server";
import { toInvoiceList, toInvoiceListQuery, type RawInvoiceList } from "./invoice-api";
import type { InvoiceList, InvoiceParams } from "./invoice";
import { jakartaDay } from "./format";

/**
 * One page of the table. Any failure throws, so the page offers a retry rather than an empty
 * table that would claim there are no creators. The backend answers a page past the end with the
 * last page, so an old link never shows an empty table either.
 */
export async function fetchRateInvoices(state: InvoiceParams): Promise<InvoiceList> {
  const response = await backendGet(`/invoices?${toInvoiceListQuery(state, jakartaDay())}`);

  if (!response.ok) {
    throw new Error(`Loading the invoices failed with HTTP ${response.status}`);
  }

  return toInvoiceList((await response.json()) as RawInvoiceList);
}
