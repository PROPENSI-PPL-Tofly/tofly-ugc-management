"use client";

import {
  amountLabel,
  bonusLabel,
  DASH,
  invoiceTitle,
  penaltyLabel,
  type InvoiceRow,
} from "@/lib/invoice";
import { BREAKDOWN_LABELS, type BreakdownKind } from "@/lib/invoice-breakdown";

// On a card the press spans the whole statement line (the cell is relative there), not the
// figure alone.
const AMOUNT =
  "cursor-pointer whitespace-nowrap border-none bg-transparent p-0 tabular-nums transition-colors hover:text-accent-deep focus-visible:text-accent-deep max-lg:after:absolute max-lg:after:inset-0";

interface Cell {
  amount: number | null;
  text: string;
  tone: string;
}

/**
 * A column of the row as the table writes it, through the table's own labels so a cell and its
 * button can never read differently. A bonus still waiting for its data is not a zero: it says
 * so, and can be opened for the reason.
 */
function cellOf(kind: BreakdownKind, row: InvoiceRow): Cell {
  switch (kind) {
    case "fixed":
      return { amount: row.fixedAmount, text: amountLabel(row.fixedAmount), tone: "text-inherit" };
    case "extra":
      return { amount: row.extraAmount, text: amountLabel(row.extraAmount), tone: "text-inherit" };
    case "bonus":
      return {
        amount: row.bonusAmount,
        text: bonusLabel(row.bonusAmount),
        tone: row.bonusAmount === null ? "text-muted" : "text-inherit",
      };
    case "penalty":
      return { amount: row.penaltyAmount, text: penaltyLabel(row.penaltyAmount), tone: "text-red-ink" };
  }
}

/**
 * One money cell of the Rate & Invoicing table (PBI-8, subtask 8.5): the column's amount as a
 * button that opens its breakdown, or the table's dash when there is nothing in it. It reports
 * the press and holds no popup itself, so a table of many rows shares one.
 */
export function BreakdownAmount({
  kind,
  row,
  onOpen,
}: Readonly<{
  kind: BreakdownKind;
  row: InvoiceRow;
  onOpen: (kind: BreakdownKind, row: InvoiceRow) => void;
}>) {
  const cell = cellOf(kind, row);

  if (cell.amount === 0) return <span className="text-muted">{DASH}</span>;

  return (
    <button
      type="button"
      title="Lihat detail"
      aria-label={`${BREAKDOWN_LABELS[kind]} ${invoiceTitle(row)}: ${cell.text}, lihat rincian`}
      className={`${AMOUNT} ${cell.tone}`}
      onClick={(event) => {
        // The row around the cell may open the whole invoice; this press is for the column only.
        event.stopPropagation();
        onOpen(kind, row);
      }}
    >
      {cell.text}
    </button>
  );
}
