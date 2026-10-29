"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { jakartaDay } from "@/lib/format";
import { canAdjust, canFinalize, REFUSAL_MESSAGES } from "@/lib/invoice-adjustment";
import type { InvoiceRow } from "@/lib/invoice";
import { FinalizeModal } from "./finalize-modal";

/** What the admin is told once an invoice is frozen, in the prototype's words. */
export const FINALIZED_MESSAGE = "Invoice difinalisasi dan dikirim ke creator.";

/**
 * The two moves an admin makes on a running invoice (PBI-12, subtask 12.2), beside Tutup in the
 * Rincian panel: add a manual adjustment, or freeze the amounts once the contract has ended.
 * Both live here rather than in the table, so the breakdown an admin reads before moving money
 * is the same one the move is made from. A frozen invoice shows neither — it is settled history.
 *
 * Finalizing is withheld while the contract still runs (the panel's footer names the day it
 * opens) or a part of the invoice still waits for data, which the button says itself: the
 * server refuses both, and the panel says so first.
 *
 * The adjustment form is the panel's to place (inline, as in the prototype); this button only
 * asks for it through `onAdjust`.
 */
export function InvoiceActions({
  row,
  today = jakartaDay(),
  onAdjust,
  onMutated,
}: Readonly<{
  row: InvoiceRow;
  /** The day the freeze gate is read against; Jakarta's, unless a test says otherwise. */
  today?: string;
  /** The admin asked to add an adjustment; the panel shows the form. */
  onAdjust: () => void;
  /** A move was accepted, with what to tell the admin; the invoice reads again. */
  onMutated: (message: string) => void;
}>) {
  const [finalizing, setFinalizing] = useState(false);

  if (!canAdjust(row.invoiceStatus)) {
    // A frozen invoice is settled: no adjustment and no second freeze.
    return null;
  }

  const finalizable = canFinalize(row.invoiceStatus, today, row.contractEnd);

  return (
    <>
      <Button variant="ghost" onClick={onAdjust}>
        + Tambah Penyesuaian
      </Button>

      {/* Before the contract ends, the panel's footer says from when it can be finalized. */}
      {finalizable && row.dataWaiting ? (
        <>
          <Button disabled title={REFUSAL_MESSAGES.INVOICE_DATA_INCOMPLETE}>
            Finalize
          </Button>
          <p className="basis-full text-xs text-muted" role="status">
            {REFUSAL_MESSAGES.INVOICE_DATA_INCOMPLETE}
          </p>
        </>
      ) : null}
      {finalizable && !row.dataWaiting ? <Button onClick={() => setFinalizing(true)}>Finalize</Button> : null}

      {finalizing ? (
        <FinalizeModal
          row={row}
          onCancel={() => setFinalizing(false)}
          onFinalized={() => {
            setFinalizing(false);
            onMutated(FINALIZED_MESSAGE);
          }}
        />
      ) : null}
    </>
  );
}
