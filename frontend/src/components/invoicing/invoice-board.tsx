"use client";

import { useRouter } from "next/navigation";
import { InvoiceTable } from "@/components/invoice/invoice-table";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  invoiceTitle,
  nextInvoiceSort,
  type InvoiceRow,
  type InvoiceSortKey,
  type InvoiceSortOrder,
} from "@/lib/invoice";
import { latestQuery, useUrlQuery } from "@/lib/url-query";
import { BreakdownAmount } from "./breakdown-amount";
import { useBreakdownPopups } from "./use-breakdown-popups";

/**
 * The Rate & Invoicing table with its breakdown popups (PBI-8, subtasks 8.4 and 8.5). The table
 * stays the server-rendered table; this client wrapper hands it a money cell that opens a
 * popup, a Rincian button per row that opens the whole invoice, and a press on a sortable
 * header, and holds the popups once for every row. The order lives in the URL like the
 * filters, so a sorted view can be linked and reloaded; a new order starts again on page one.
 * A decision taken from a Content Detail panel reads the page again, so the amounts follow it.
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
  const { open, layers } = useBreakdownPopups({
    rows,
    onDecided: () => router.refresh(),
    onMutated: (message) => {
      show(message);
      router.refresh();
    },
  });

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
      <InvoiceTable
        rows={rows}
        amount={(kind, row) => <BreakdownAmount kind={kind} row={row} onOpen={open} />}
        sort={sort ? { ...sort, onSort: (key) => sortBy(sort, key) } : undefined}
        summary={summary}
        action={(row) => (
          <Button aria-label={`Rincian invoice ${invoiceTitle(row)}`} onClick={() => open("all", row)}>
            Rincian
          </Button>
        )}
      />
      {layers}
      {toast}
    </>
  );
}
