import type { ReactNode } from "react";
import { InfoTip } from "@/components/ui/info-tip";
import { Pill, StatusDot, type Tone } from "@/components/ui/pill";
import { SortableTh } from "@/components/ui/sortable-th";
import { formatRupiah } from "@/lib/format";
import {
  amountLabel,
  bonusLabel,
  CONTRACT_STATUS_LABELS,
  DASH,
  finalLabel,
  INVOICE_STATUS_LABELS,
  invoiceTitle,
  penaltyLabel,
  TOTAL_FORMULA,
  type ContractStatus,
  type InvoiceRow,
  type InvoiceSortKey,
  type InvoiceSortOrder,
  type InvoiceStatus,
} from "@/lib/invoice";
import type { BreakdownKind } from "@/lib/invoice-breakdown";

const HEAD = "px-5 py-3 text-left font-semibold";
const NUM_HEAD = "px-5 py-3 text-right font-semibold";
const CELL = "px-5 py-3 align-top";
const NUM = `${CELL} whitespace-nowrap text-right tabular-nums`;

/** The contract dot, coloured apart with the app's own tones where the prototype used its. */
export const CONTRACT_TONES: Record<ContractStatus, Tone> = {
  active: "green",
  upcoming: "accent",
  expired: "neutral",
};

export const INVOICE_TONES: Record<InvoiceStatus, Tone> = {
  accruing: "neutral",
  finalized: "amber",
  creator_acked: "accent",
  payment_uploaded: "amber",
  paid: "green",
};

/** What each sortable column's two directions mean, for the header's title. */
const SORT_HINTS = {
  name: { asc: "Nama A–Z", desc: "Nama Z–A" },
  fixed: { asc: "Fixed rate terkecil dulu", desc: "Fixed rate terbesar dulu" },
  penalty: { asc: "Penalti terkecil dulu", desc: "Penalti terbesar dulu" },
  total: { asc: "Total terkecil dulu", desc: "Total terbesar dulu" },
} as const;

/** The table's order and where a press on a sortable header goes; the board keeps it in the URL. */
export interface InvoiceTableSort {
  key: InvoiceSortKey;
  order: InvoiceSortOrder;
  onSort: (key: InvoiceSortKey) => void;
}

/**
 * The column widths, the prototype's. Classes, not inline styles, which the CSP refuses; each is
 * named by its column, since several columns share a width and a width alone cannot key one.
 * The action column joins them only when the board hands one in.
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

/** A header that sorts when the board hands in an order, and a plain one otherwise. */
function headerCell(
  label: string,
  key: Exclude<InvoiceSortKey, "action">,
  sort: InvoiceTableSort | undefined,
  align: "left" | "right",
  beside?: ReactNode,
) {
  if (!sort) {
    return (
      <th scope="col" className={align === "right" ? NUM_HEAD : HEAD}>
        <span className={`inline-flex items-center gap-1 ${align === "right" ? "justify-end" : ""}`}>
          {label}
          {beside}
        </span>
      </th>
    );
  }
  return (
    <SortableTh
      label={label}
      direction={sort.key === key ? sort.order : null}
      hints={SORT_HINTS[key]}
      align={align}
      beside={beside}
      onToggle={() => sort.onSort(key)}
    />
  );
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
 * draws a money cell in place of the plain text. Total and the invoice are never replaced.
 *
 * What the board adds is optional, so the table stays one table: `sort` turns four headers
 * into sort buttons, `summary` adds a footer with what every creator the filters keep is owed,
 * and `action` adds a column of per-row actions (Rincian now, Finalize with PBI-12).
 */
export function InvoiceTable({
  rows,
  amount,
  sort,
  summary,
  action,
}: Readonly<{
  rows: readonly InvoiceRow[];
  /** Draws one money cell; the plain amounts when it is not given. */
  amount?: (kind: BreakdownKind, row: InvoiceRow) => ReactNode;
  sort?: InvoiceTableSort;
  /** Every creator the filters keep, across pages: how many and what they are owed together. */
  summary?: { total: number; count: number };
  /** Draws the actions of one row. */
  action?: (row: InvoiceRow) => ReactNode;
}>) {
  const columns = action ? [...COLUMNS, ["actions", "w-[9%]"] as const] : COLUMNS;

  return (
    // relative: the scroll region is the containing block of anything absolutely placed inside
    // it, so nothing escapes it and widens the page.
    <div className="relative overflow-x-auto">
      <table className="w-full text-[13px]">
        <colgroup>
          {columns.map(([column, width]) => (
            <col key={column} className={width} />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b border-rule text-muted">
            {headerCell("Creator", "name", sort, "left")}
            {headerCell("Fixed Rate", "fixed", sort, "right")}
            <th scope="col" className={NUM_HEAD}>
              Fee Konten Tambahan
            </th>
            <th scope="col" className={NUM_HEAD}>
              Bonus Performa
            </th>
            {headerCell("Penalti", "penalty", sort, "right")}
            {headerCell(
              "Total",
              "total",
              sort,
              "right",
              <InfoTip label="Info rumus Total" text={TOTAL_FORMULA} align="end" />,
            )}
            <th scope="col" className={HEAD}>
              Status Invoice
            </th>
            {action ? (
              <th scope="col" className={HEAD}>
                {/* The prototype heads this column with nothing; the name stays for a screen reader. */}
                <span className="sr-only">Aksi</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-5 py-14 text-center text-muted">
                Tidak ada creator sesuai filter.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.contractId} className="border-b border-rule last:border-b-0">
                <td className={`${CELL} min-w-44`}>
                  <strong className="block truncate" title={invoiceTitle(row)}>
                    {invoiceTitle(row)}
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
                {action ? <td className={`${CELL} text-right`}>{action(row)}</td> : null}
              </tr>
            ))
          )}
        </tbody>
        {summary && rows.length > 0 ? (
          <tfoot>
            <tr className="border-t border-rule bg-surface-2">
              <th scope="row" colSpan={5} className={`${CELL} text-left font-semibold`}>
                {`Total ${summary.count} creator`}
              </th>
              <td className={NUM}>
                <strong>{formatRupiah(summary.total)}</strong>
              </td>
              <td colSpan={columns.length - 6} className={CELL} />
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
