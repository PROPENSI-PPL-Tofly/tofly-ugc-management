// Server-side only: the Rate & Invoicing table's list, fetched while the page renders.
//
// TODO(SCRUM-8.3): GET /invoices does not exist yet, so the fixture stands in for it — same
// query, same answer shape. When 8.3 lands, this function calls the backend the way
// content-plan.server.ts does (BACKEND_URL, the browser's session forwarded) and nothing else
// in the table changes. The page past the end stays: an old link shows the last page rather
// than an empty table that would claim there are no creators.

import { invoiceFixture } from "./invoice.fixture";
import { toInvoiceList, toInvoiceListQuery } from "./invoice-api";
import type { InvoiceList, InvoiceParams } from "./invoice";

export async function fetchRateInvoices(state: InvoiceParams): Promise<InvoiceList> {
  const answer = invoiceFixture(toInvoiceListQuery(state));

  if (answer.items.length === 0 && answer.totalPages > 0 && state.page > answer.totalPages) {
    return toInvoiceList(invoiceFixture(toInvoiceListQuery({ ...state, page: answer.totalPages })));
  }

  return toInvoiceList(answer);
}
