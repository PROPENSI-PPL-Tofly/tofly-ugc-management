"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { InvoiceTable } from "@/components/invoice/invoice-table";
import { useToast } from "@/components/ui/toast";
import {
  nextInvoiceSort,
  type InvoiceRow,
  type InvoiceSortKey,
  type InvoiceSortOrder,
} from "@/lib/invoice";
import { latestQuery, useUrlQuery } from "@/lib/url-query";
import { BreakdownAmount } from "./breakdown-amount";
import { BulkExportButton } from "./bulk-export-button";
import { skippedInvoices, toggleAllOnPage, toggleId } from "./bulk-selection";
import { useBreakdownPopups } from "./use-breakdown-popups";

/**
 * The Rate & Invoicing table with its breakdown popups (PBI-8, subtasks 8.4 and 8.5). The table
 * stays the server-rendered table; this client wrapper hands it a money cell that opens a
 * popup, a row that opens the whole invoice on a press, and a press on a sortable
 * header, and holds the popups once for every row. The order lives in the URL like the
 * filters, so a sorted view can be linked and reloaded; a new order starts again on page one.
 * A decision taken from a Content Detail panel reads the page again, so the amounts follow it.
 *
 * 31.5 adds the page-local ticks and the bulk download. Only the rows on the current page can be
 * ticked; a tick that is no longer on the page is ignored, so paging never sends a stale invoice.
 */
export function InvoiceBoard({
  rows,
  sort,
  summary,
}: Readonly<{
  rows: readonly InvoiceRow[];
  /** The order on show; the headers stay plain when it is not given. */
  sort?: { key: InvoiceSortKey; order: InvoiceSortOrder };
  /** Every creator the filters keep: how many and what they are owed together. */
  summary?: { total: number; count: number };
}>) {
  const router = useRouter();
  const { replaceQuery } = useUrlQuery();
  const { show, toast } = useToast();
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const { open, layers } = useBreakdownPopups({
    rows,
    onDecided: () => router.refresh(),
    onMutated: (message) => {
      show(message);
      router.refresh();
    },
  });

  const pageIds = rows.map((row) => row.contractId);
  const ticked = selected.filter((id) => pageIds.includes(id));
  const skipped = skippedInvoices(rows, ticked);

  // A header always names a column, never the default order, so a press always writes both.
  function sortBy(current: { key: InvoiceSortKey; order: InvoiceSortOrder }, key: InvoiceSortKey) {
    const next = new URLSearchParams(latestQuery());
    const chosen = nextInvoiceSort({ sort: current.key, order: current.order }, key);
    next.set("sort", chosen.sort);
    next.set("order", chosen.order);
    next.delete("page");
    replaceQuery(next.toString());
  }

  return (
    <>
      <div className="flex justify-end px-5 pt-3">
        <BulkExportButton
          ids={ticked}
          exportable={ticked.length - skipped.length}
          onDone={(message) => {
            show(message);
            setSelected([]);
            if (skipped.length > 0) {
              const names = skipped
                .map(({ title, label }) => `${title} (${label})`)
                .join(", ");
              setNotice(
                `${skipped.length} invoice dilewati karena masih Berjalan atau Cancelled: ${names}.`,
              );
            }
          }}
          onFailure={show}
        />
      </div>
      {notice ? (
        <p
          role="status"
          aria-label="Pemberitahuan ekspor"
          className="mx-5 mt-3 flex items-start justify-between gap-2 rounded-(--radius-control) bg-amber-wash px-4 py-2 text-[13px] text-amber-ink"
        >
          <span>{notice}</span>
          <button
            type="button"
            aria-label="Tutup pemberitahuan"
            onClick={() => setNotice(null)}
            className="min-h-11 cursor-pointer px-2 text-lg leading-none"
          >
            ×
          </button>
        </p>
      ) : null}
      <InvoiceTable
        rows={rows}
        amount={(kind, row) => <BreakdownAmount kind={kind} row={row} onOpen={open} />}
        sort={sort ? { ...sort, onSort: (key) => sortBy(sort, key) } : undefined}
        summary={summary}
        // The row opens the whole invoice (Rincian); its money cells open their own breakdowns.
        onOpen={(row) => open("all", row)}
        selection={{
          ids: ticked,
          onToggle: (id) => setSelected((ids) => toggleId(ids, id)),
          onToggleAll: (ids) => setSelected((current) => toggleAllOnPage(current, ids)),
        }}
      />
      {layers}
      {toast}
    </>
  );
}
