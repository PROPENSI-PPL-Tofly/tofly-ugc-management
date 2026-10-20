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

// Below lg each contract is a card that reads like a statement: the header row is hidden, and
// each amount sets its column's name (data-label) against the figure, label left, amount right.
const CELL = "px-5 py-3 align-top max-lg:block max-lg:px-0 max-lg:py-1";
const AGAINST =
  "max-lg:flex max-lg:items-baseline max-lg:justify-between max-lg:gap-3 max-lg:before:text-xs max-lg:before:font-normal max-lg:before:text-muted max-lg:before:content-[attr(data-label)]";
const NUM = `${CELL} whitespace-nowrap text-right tabular-nums ${AGAINST}`;

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
      <th role="columnheader" scope="col" className={align === "right" ? NUM_HEAD : HEAD}>
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
      // Below lg the cards hide this row; PhoneSort takes the press there.
      stacked
      onToggle={() => sort.onSort(key)}
    />
  );
}

/** The sortable columns, in the order the headers offer them. */
const SORTABLE: readonly { key: Exclude<InvoiceSortKey, "action">; label: string }[] = [
  { key: "name", label: "Creator" },
  { key: "fixed", label: "Fixed Rate" },
  { key: "penalty", label: "Penalti" },
  { key: "total", label: "Total" },
];

/**
 * The headers' sorts for the cards below lg, where the header row is hidden: one button per
 * sortable column, pressed the same way (another column starts it, the same one turns it
 * over), the column on show marked and its order said in words. Gone from lg up.
 */
function PhoneSort({ sort }: Readonly<{ sort: InvoiceTableSort }>) {
  const active = sort.key === "action" ? null : sort.key;

  return (
    <div role="group" aria-label="Urutkan" className="flex flex-wrap items-center gap-2 px-5 pt-3 lg:hidden">
      <span className="text-xs text-muted">Urutkan</span>
      {SORTABLE.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          aria-pressed={active === key}
          onClick={() => sort.onSort(key)}
          className="min-h-11 cursor-pointer rounded-full border border-rule bg-surface px-3 text-xs font-semibold text-ink-2 aria-pressed:border-accent aria-pressed:bg-accent-wash aria-pressed:text-accent-deep"
        >
          {label}
          {active === key ? <span aria-hidden="true">{` ${sort.order === "asc" ? "↑" : "↓"}`}</span> : null}
        </button>
      ))}
      {active ? <p className="basis-full text-xs text-muted">{SORT_HINTS[active][sort.order]}</p> : null}
    </div>
  );
}

function finalCell(row: InvoiceRow) {
  // The backend's running total; while the bonus waits the Bonus cell says so beside it.
  return (
    <>
      <strong>{finalLabel(row)}</strong>
      {row.floored ? (
        <span className="mt-1 block whitespace-normal text-xs text-red-ink max-lg:basis-full max-lg:text-right">
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
      {sort ? <PhoneSort sort={sort} /> : null}
      {/* Explicit roles: a table whose display changes can lose its semantics in some browsers. */}
      <table role="table" className="w-full text-[13px] max-lg:block">
        <colgroup className="max-lg:hidden">
          {columns.map(([column, width]) => (
            <col key={column} className={width} />
          ))}
        </colgroup>
        <thead role="rowgroup" className="max-lg:sr-only">
          <tr role="row" className="border-b border-rule text-muted">
            {headerCell("Creator", "name", sort, "left")}
            {headerCell("Fixed Rate", "fixed", sort, "right")}
            <th role="columnheader" scope="col" className={NUM_HEAD}>
              Fee Konten Tambahan
            </th>
            <th role="columnheader" scope="col" className={NUM_HEAD}>
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
            <th role="columnheader" scope="col" className={HEAD}>
              Status Invoice
            </th>
            {action ? (
              <th role="columnheader" scope="col" className={HEAD}>
                {/* The prototype heads this column with nothing; the name stays for a screen reader. */}
                <span className="sr-only">Aksi</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody role="rowgroup" className="max-lg:flex max-lg:flex-col max-lg:gap-3 max-lg:bg-paper max-lg:p-3">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-5 py-14 text-center text-muted">
                Tidak ada creator sesuai filter.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.contractId}
                role="row"
                className="border-b border-rule lg:last:border-b-0 max-lg:block max-lg:rounded-(--radius-panel) max-lg:border max-lg:bg-surface max-lg:px-4 max-lg:py-3"
              >
                <td role="cell" className={`${CELL} min-w-44 max-lg:min-w-0 max-lg:pb-2`}>
                  <strong className="block truncate max-lg:whitespace-normal" title={invoiceTitle(row)}>
                    {invoiceTitle(row)}
                  </strong>
                  <p className="mt-1">
                    <StatusDot tone={CONTRACT_TONES[row.contractStatus]}>
                      {`Kontrak ${CONTRACT_STATUS_LABELS[row.contractStatus]}`}
                    </StatusDot>
                  </p>
                </td>
                <td role="cell" data-label="Fixed Rate" className={NUM}>
                  {amount ? amount("fixed", row) : amountCell(row.fixedAmount, amountLabel(row.fixedAmount))}
                </td>
                <td role="cell" data-label="Fee Konten Tambahan" className={NUM}>
                  {amount ? amount("extra", row) : amountCell(row.extraAmount, amountLabel(row.extraAmount))}
                </td>
                <td role="cell" data-label="Bonus Performa" className={NUM}>
                  {amount ? amount("bonus", row) : bonusCell(row)}
                </td>
                <td role="cell" data-label="Penalti" className={NUM}>
                  {amount ? amount("penalty", row) : penaltyCell(row.penaltyAmount)}
                </td>
                {/* The sum, set apart under the amounts it adds up in a card. */}
                <td
                  role="cell"
                  data-label="Total"
                  className={`${NUM} max-lg:mt-1 max-lg:flex-wrap max-lg:border-t max-lg:border-rule-2 max-lg:pt-2`}
                >
                  {finalCell(row)}
                </td>
                <td role="cell" data-label="Status Invoice" className={`${CELL} ${AGAINST}`}>
                  <Pill tone={INVOICE_TONES[row.invoiceStatus]}>
                    {INVOICE_STATUS_LABELS[row.invoiceStatus]}
                  </Pill>
                </td>
                {action ? (
                  // A full-width target on a phone, well above WCAG 2.5.8's 24 px.
                  <td
                    role="cell"
                    className={`${CELL} text-right max-lg:pt-2 max-lg:[&_button]:min-h-11 max-lg:[&_button]:w-full`}
                  >
                    {action(row)}
                  </td>
                ) : null}
              </tr>
            ))
          )}
        </tbody>
        {summary && rows.length > 0 ? (
          // Below lg the sum is one line of its own under the cards.
          <tfoot role="rowgroup" className="max-lg:block max-lg:px-3 max-lg:pb-3">
            <tr
              role="row"
              className="border-t border-rule bg-surface-2 max-lg:flex max-lg:items-baseline max-lg:justify-between max-lg:gap-3 max-lg:rounded-(--radius-panel) max-lg:border max-lg:px-4 max-lg:py-3"
            >
              <th scope="row" colSpan={5} className={`${CELL} text-left font-semibold max-lg:p-0`}>
                {`Total ${summary.count} invoice`}
              </th>
              <td className={`${CELL} whitespace-nowrap text-right tabular-nums max-lg:p-0`}>
                <strong>{formatRupiah(summary.total)}</strong>
              </td>
              <td colSpan={columns.length - 6} className={`${CELL} max-lg:hidden`} />
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
