import { INVOICE_TONES } from "@/components/invoice/invoice-table";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { totalAmountLabel, type CreatorInvoice } from "@/lib/creator-invoice";
import { formatContractWindow } from "@/lib/format";
import { INVOICE_STATUS_LABELS } from "@/lib/invoice";

const HEAD = "px-5 py-3 text-left font-semibold";

// Below lg each invoice is a card of its own, as Task Saya's tasks are: cells stack, and the
// status and total name their column from data-label since the header row is hidden.
const CELL = "px-5 py-3 align-top max-lg:block max-lg:px-0 max-lg:py-1";
const LABELLED =
  "max-lg:flex max-lg:items-center max-lg:gap-2 max-lg:before:w-20 max-lg:before:shrink-0 max-lg:before:text-xs max-lg:before:text-muted max-lg:before:content-[attr(data-label)]";

/**
 * The creator's earlier invoices, one row per past contract (the prototype's Riwayat Invoice):
 * the period, where its payment stands and what it came to. Rincian opens the invoice in full,
 * where an earlier contract's acknowledgement or confirmation can still be made.
 */
export function InvoiceHistory({
  invoices,
  onOpen,
}: Readonly<{
  invoices: readonly CreatorInvoice[];
  onOpen: (invoice: CreatorInvoice) => void;
}>) {
  return (
    // Positioned, so the visually hidden Aksi heading is laid out inside this area, not the page.
    <div className="relative overflow-x-auto">
      {/* Explicit roles: a table whose display changes can lose its semantics in some browsers.
          A <td> keeps none of its own: it is a cell of the explicit row it sits in. */}
      <table role="table" aria-label="Riwayat Invoice" className="w-full text-[13px] max-lg:block">
        <thead role="rowgroup" className="max-lg:sr-only">
          <tr role="row" className="border-b border-rule text-muted">
            <th scope="col" className={HEAD}>
              Periode
            </th>
            <th scope="col" className={HEAD}>
              Status
            </th>
            <th scope="col" className={`${HEAD} text-right`}>
              Total
            </th>
            <th scope="col" className={HEAD}>
              <span className="sr-only">Aksi</span>
            </th>
          </tr>
        </thead>
        <tbody role="rowgroup" className="max-lg:flex max-lg:flex-col max-lg:gap-3 max-lg:bg-paper max-lg:p-3">
          {invoices.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-5 py-10 text-center text-muted">
                Belum ada invoice dari periode sebelumnya.
              </td>
            </tr>
          ) : (
            invoices.map((invoice) => (
              <tr
                key={invoice.contractId}
                role="row"
                className="border-b border-rule-2 lg:last:border-b-0 max-lg:block max-lg:rounded-(--radius-panel) max-lg:border max-lg:border-rule max-lg:bg-surface max-lg:px-4 max-lg:py-3"
              >
                <td className={CELL}>
                  <span className="font-semibold">{`Periode ${invoice.periodNumber}`}</span>
                  <span className="block text-xs text-muted">
                    {formatContractWindow(invoice.periodStart, invoice.periodEnd)}
                  </span>
                </td>
                <td data-label="Status" className={`${CELL} ${LABELLED}`}>
                  <Pill tone={INVOICE_TONES[invoice.status]}>{INVOICE_STATUS_LABELS[invoice.status]}</Pill>
                </td>
                <td
                  data-label="Total"
                  className={`${CELL} ${LABELLED} text-right font-semibold whitespace-nowrap tabular-nums max-lg:text-left`}
                >
                  {totalAmountLabel(invoice)}
                </td>
                <td className={`${CELL} text-right max-lg:pt-2`}>
                  <Button
                    variant="ghost"
                    // A full-width target on a phone; the border keeps it reading as a button.
                    className="max-lg:min-h-11 max-lg:w-full max-lg:border-rule"
                    aria-label={`Rincian invoice Periode ${invoice.periodNumber}`}
                    onClick={() => onOpen(invoice)}
                  >
                    Rincian
                  </Button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
