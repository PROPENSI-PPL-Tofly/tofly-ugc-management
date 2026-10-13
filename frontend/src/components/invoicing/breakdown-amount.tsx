"use client";

import { formatRupiah } from "@/lib/format";
import {
  BREAKDOWN_LABELS,
  WAITING_FOR_DATA,
  type BreakdownKind,
  type InvoiceBreakdown,
} from "@/lib/invoice-breakdown";

const AMOUNT =
  "cursor-pointer whitespace-nowrap border-none bg-transparent p-0 tabular-nums transition-colors hover:text-accent-deep focus-visible:text-accent-deep";

/**
 * How a column reads in its table cell, or null when there is nothing in it to open. A bonus
 * whose performance data has not come in is unknown, not zero, so it says so and can still be
 * opened for the reason; a penalty reads as money taken away.
 */
function cellText(kind: BreakdownKind, breakdown: InvoiceBreakdown): string | null {
  const { total } = breakdown[kind];

  if (total === 0) {
    const waiting = kind === "bonus" && breakdown.bonus.performance === "waiting";
    return waiting ? WAITING_FOR_DATA : null;
  }

  return formatRupiah(kind === "penalty" ? -total : total);
}

/**
 * One money cell of the Rate & Invoicing table (PBI-8, subtask 8.5): the column's amount as a
 * button that opens its breakdown, or a dash when the column is empty. It reports the press and
 * holds no popup itself, so a table of many rows shares one.
 */
export function BreakdownAmount({
  kind,
  breakdown,
  onOpen,
}: Readonly<{
  kind: BreakdownKind;
  breakdown: InvoiceBreakdown;
  onOpen: (kind: BreakdownKind, breakdown: InvoiceBreakdown) => void;
}>) {
  const text = cellText(kind, breakdown);

  if (text === null) return <span className="text-muted">—</span>;

  return (
    <button
      type="button"
      title="Lihat detail"
      aria-label={`${BREAKDOWN_LABELS[kind]} ${breakdown.creatorName}: ${text}, lihat rincian`}
      className={`${AMOUNT} ${kind === "penalty" ? "text-red-ink" : "text-inherit"}`}
      onClick={(event) => {
        // The row around the cell opens the whole invoice; this press is for the column only.
        event.stopPropagation();
        onOpen(kind, breakdown);
      }}
    >
      {text}
    </button>
  );
}
