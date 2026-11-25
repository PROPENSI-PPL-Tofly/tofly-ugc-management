import { INVOICE_STATUS_LABELS, invoiceTitle, type InvoiceStatus } from "@/lib/invoice";

/** The app's pipeline plus Cancelled, which the prototype can show for an ended contract. */
export type SelectableStatus = InvoiceStatus | "cancelled";

/** What a table row must give the selection so the notice can name the invoice it skipped. */
export interface SelectableRow {
  contractId: string;
  creatorName: string;
  periodNumber: number;
  invoiceStatus: SelectableStatus;
}

export interface SkippedInvoice {
  title: string;
  label: string;
}

export function toggleId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id];
}

/** Select all on the page; a second press clears just those, leaving other pages' ticks alone. */
export function toggleAllOnPage(
  ids: readonly string[],
  pageIds: readonly string[],
): string[] {
  const all = pageIds.length > 0 && pageIds.every((id) => ids.includes(id));
  return all
    ? ids.filter((id) => !pageIds.includes(id))
    : [...new Set([...ids, ...pageIds])];
}

function skippable(status: SelectableStatus): boolean {
  return status === "accruing" || status === "cancelled";
}

/** The two statuses that can be skipped both have a word in the app already. */
function label(status: SelectableStatus): string {
  return status === "cancelled"
    ? "Cancelled"
    : INVOICE_STATUS_LABELS[status];
}

/** Running (and Cancelled, where present) are never downloaded, and are named in the notice. */
export function skippedInvoices(
  rows: readonly SelectableRow[],
  selected: readonly string[],
): SkippedInvoice[] {
  return rows
    .filter((row) => selected.includes(row.contractId) && skippable(row.invoiceStatus))
    .map((row) => ({ title: invoiceTitle(row), label: label(row.invoiceStatus) }));
}
