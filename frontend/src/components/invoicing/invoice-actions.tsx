"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { jakartaDay } from "@/lib/format";
import { canAdjust, canFinalize, refusalMessage } from "@/lib/invoice-adjustment";
import type { InvoiceRow } from "@/lib/invoice";
import { AdjustmentForm } from "./adjustment-form";
import { FinalizeModal } from "./finalize-modal";

/**
 * The two moves an admin makes on a running invoice (PBI-12, subtask 12.2), beside Tutup in the
 * Rincian panel: add a manual adjustment, or freeze the amounts once the contract has ended.
 * Both live here rather than in the table, so the breakdown an admin reads before moving money
 * is the same one the move is made from. A frozen invoice shows neither — it is settled history.
 *
 * Finalizing is withheld, with its reason, while the contract still runs or a part of the
 * invoice still waits for data: the server refuses both, and the button says so first.
 */
export function InvoiceActions({
  row,
  today = jakartaDay(),
  onMutated,
}: Readonly<{
  row: InvoiceRow;
  /** The day the freeze gate is read against; Jakarta's, unless a test says otherwise. */
  today?: string;
  /** A move was accepted; the invoice reads again. */
  onMutated: () => void;
}>) {
  const [dialog, setDialog] = useState<"adjust" | "finalize" | null>(null);

  if (!canAdjust(row.invoiceStatus)) {
    // A frozen invoice is settled: no adjustment and no second freeze.
    return null;
  }

  const finalizable = canFinalize(row.invoiceStatus, today, row.contractEnd);

  return (
    <>
      <Button variant="ghost" onClick={() => setDialog("adjust")}>
        + Tambah Penyesuaian
      </Button>

      {finalizable ? (
        row.dataWaiting ? (
          <>
            <Button disabled title={refusalMessage("INVOICE_DATA_INCOMPLETE") ?? undefined}>
              Finalize
            </Button>
            <p className="basis-full text-xs text-muted" role="status">
              {refusalMessage("INVOICE_DATA_INCOMPLETE")}
            </p>
          </>
        ) : (
          <Button onClick={() => setDialog("finalize")}>Finalize</Button>
        )
      ) : (
        <p className="basis-full text-xs text-muted" role="status">
          Bisa difinalisasi setelah kontrak berakhir.
        </p>
      )}

      {dialog === "adjust" ? (
        <AdjustmentForm
          contractId={row.contractId}
          onClose={() => setDialog(null)}
          onMutated={onMutated}
        />
      ) : null}

      {dialog === "finalize" ? (
        <FinalizeModal row={row} onCancel={() => setDialog(null)} onFinalized={onMutated} />
      ) : null}
    </>
  );
}
