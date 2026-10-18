"use client";

import { useRouter } from "next/navigation";
import { InvoiceTable } from "@/components/invoice/invoice-table";
import type { InvoiceRow } from "@/lib/invoice";
import { BreakdownAmount } from "./breakdown-amount";
import { useBreakdownPopups } from "./use-breakdown-popups";

/**
 * The Rate & Invoicing table with its breakdown popups (PBI-8, subtask 8.5). The table stays
 * the server-rendered 8.4 table; this client wrapper only hands it a money cell that opens a
 * popup, and holds the popups once for every row. A decision taken from a popup's Content Detail
 * panel reads the page again, so the amounts follow it.
 */
export function InvoiceBoard({ rows }: Readonly<{ rows: readonly InvoiceRow[] }>) {
  const router = useRouter();
  const { open, layers } = useBreakdownPopups({ onDecided: () => router.refresh() });

  return (
    <>
      <InvoiceTable
        rows={rows}
        amount={(kind, row) => <BreakdownAmount kind={kind} row={row} onOpen={open} />}
      />
      {layers}
    </>
  );
}
