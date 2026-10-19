import { INVOICE_TONES } from "@/components/invoice/invoice-table";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { totalAmountLabel, type CreatorInvoice } from "@/lib/creator-invoice";
import { formatContractWindow } from "@/lib/format";
import { INVOICE_STATUS_LABELS } from "@/lib/invoice";

const HEAD = "px-5 py-3 text-left font-semibold";
const CELL = "px-5 py-3 align-top";

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
    <div className="overflow-x-auto">
      <table aria-label="Riwayat Invoice" className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-rule text-muted">
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
        <tbody>
          {invoices.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-5 py-10 text-center text-muted">
                Belum ada invoice dari periode sebelumnya.
              </td>
            </tr>
          ) : (
            invoices.map((invoice) => (
              <tr key={invoice.contractId} className="border-b border-rule-2 last:border-b-0">
                <td className={CELL}>
                  <span className="font-semibold">{`Periode ${invoice.periodNumber}`}</span>
                  <span className="block text-xs text-muted">
                    {formatContractWindow(invoice.periodStart, invoice.periodEnd)}
                  </span>
                </td>
                <td className={CELL}>
                  <Pill tone={INVOICE_TONES[invoice.status]}>{INVOICE_STATUS_LABELS[invoice.status]}</Pill>
                </td>
                <td className={`${CELL} text-right font-semibold whitespace-nowrap tabular-nums`}>
                  {totalAmountLabel(invoice)}
                </td>
                <td className={`${CELL} text-right`}>
                  <Button
                    variant="ghost"
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
