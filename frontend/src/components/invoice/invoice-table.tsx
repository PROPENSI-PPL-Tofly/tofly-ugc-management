import type { ReactNode } from "react";
import { Pill, StatusDot, type Tone } from "@/components/ui/pill";
import {
  amountLabel,
  bonusLabel,
  CONTRACT_STATUS_LABELS,
  DASH,
  finalLabel,
  INVOICE_STATUS_LABELS,
  penaltyLabel,
  type ContractStatus,
  type InvoiceRow,
  type InvoiceStatus,
} from "@/lib/invoice";
import type { BreakdownKind } from "@/lib/invoice-breakdown";

const HEAD = "px-5 py-3 text-left font-semibold";
const NUM_HEAD = "px-5 py-3 text-right font-semibold";
const CELL = "px-5 py-3 align-top";
const NUM = `${CELL} whitespace-nowrap text-right tabular-nums`;

/** The contract dot, coloured apart with the app's own tones where the prototype used its. */
const CONTRACT_TONES: Record<ContractStatus, Tone> = {
  active: "green",
  upcoming: "accent",
  expired: "neutral",
};

const INVOICE_TONES: Record<InvoiceStatus, Tone> = {
  accruing: "neutral",
  finalized: "amber",
  creator_acked: "accent",
  payment_uploaded: "amber",
  paid: "green",
};

/**
 * The column widths, the prototype's spread over the seven columns there are until Finalize
 * (PBI-12) brings an action column. Classes, not inline styles, which the CSP refuses; each is
 * named by its column, since several columns share a width and a width alone cannot key one.
 */
const COLUMNS = [
  ["creator", "w-[20%]"],
  ["fixed", "w-[12%]"],
  ["extra", "w-[13%]"],
  ["bonus", "w-[13%]"],
  ["penalty", "w-[13%]"],
  ["final", "w-[13%]"],
  ["invoice", "w-[16%]"],
] as const;

function amountCell(amount: number, label: string) {
  return amount === 0 ? <span className="text-muted">{DASH}</span> : label;
}

function penaltyCell(amount: number) {
  return amount === 0 ? (
    <span className="text-muted">{DASH}</span>
  ) : (
    // What is taken off reads as a minus, in the colour the prototype gives a penalty.
    <span className="text-red-ink">{penaltyLabel(amount)}</span>
  );
}

function bonusCell(row: InvoiceRow) {
  if (row.bonusAmount === null) {
    return <span className="text-muted">Menunggu data</span>;
  }

  return amountCell(row.bonusAmount, bonusLabel(row.bonusAmount));
}

function finalCell(row: InvoiceRow) {
  // The backend's running total; while the bonus waits the Bonus cell says so beside it.
  return (
    <>
      <strong>{finalLabel(row)}</strong>
      {row.floored ? (
        <span className="mt-1 block whitespace-normal text-xs text-red-ink">
          Penalti melebihi pembayaran
        </span>
      ) : null}
    </>
  );
}

/**
 * The Rate & Invoicing table (PBI-8, subtask 8.4): one row per creator, the four amounts the
 * invoice is built from and where the invoice stands. Structured as the prototype structures
 * it — columns, widths and cell anatomy — in the app's own colours. Amounts are plain text
 * here; the breakdown popups (8.5) put their triggers in these cells through `amount`, which
 * draws a money cell in place of the plain text. Final Rate and the invoice are never replaced.
 */
export function InvoiceTable({
  rows,
  amount,
}: Readonly<{
  rows: readonly InvoiceRow[];
  /** Draws one money cell; the plain amounts when it is not given. */
  amount?: (kind: BreakdownKind, row: InvoiceRow) => ReactNode;
}>) {
  return (
    // relative: the scroll region is the containing block of anything absolutely placed inside
    // it, so nothing escapes it and widens the page.
    <div className="relative overflow-x-auto">
      <table className="w-full text-[13px]">
        <colgroup>
          {COLUMNS.map(([column, width]) => (
            <col key={column} className={width} />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b border-rule text-muted">
            <th scope="col" className={HEAD}>
              Creator
            </th>
            <th scope="col" className={NUM_HEAD}>
              Fixed Rate
            </th>
            <th scope="col" className={NUM_HEAD}>
              Fee Konten Tambahan
            </th>
            <th scope="col" className={NUM_HEAD}>
              Bonus Performa
            </th>
            <th scope="col" className={NUM_HEAD}>
              Penalti
            </th>
            <th scope="col" className={NUM_HEAD}>
              Total
            </th>
            <th scope="col" className={HEAD}>
              Status Invoice
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={COLUMNS.length} className="px-5 py-14 text-center text-muted">
                Tidak ada creator sesuai filter.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.creatorId} className="border-b border-rule last:border-b-0">
                <td className={`${CELL} min-w-44`}>
                  <strong className="block truncate" title={row.creatorName}>
                    {row.creatorName}
                  </strong>
                  <p className="mt-1">
                    <StatusDot tone={CONTRACT_TONES[row.contractStatus]}>
                      {`Kontrak ${CONTRACT_STATUS_LABELS[row.contractStatus]}`}
                    </StatusDot>
                  </p>
                </td>
                <td className={NUM}>
                  {amount ? amount("fixed", row) : amountCell(row.fixedAmount, amountLabel(row.fixedAmount))}
                </td>
                <td className={NUM}>
                  {amount ? amount("extra", row) : amountCell(row.extraAmount, amountLabel(row.extraAmount))}
                </td>
                <td className={NUM}>{amount ? amount("bonus", row) : bonusCell(row)}</td>
                <td className={NUM}>
                  {amount ? amount("penalty", row) : penaltyCell(row.penaltyAmount)}
                </td>
                <td className={NUM}>{finalCell(row)}</td>
                <td className={CELL}>
                  <Pill tone={INVOICE_TONES[row.invoiceStatus]}>
                    {INVOICE_STATUS_LABELS[row.invoiceStatus]}
                  </Pill>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
