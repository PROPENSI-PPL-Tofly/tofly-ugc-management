"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { finalizeInvoice } from "@/lib/invoice-actions.server";
import {
  amountLabel,
  bonusLabel,
  finalLabel,
  penaltyLabel,
  type InvoiceRow,
} from "@/lib/invoice";
import { AdjustmentLines } from "./adjustment-lines";

/**
 * The confirmation before an invoice is frozen (PBI-12, subtask 12.2): the whole breakdown and
 * the total, in the words the table writes them, and one question. After this the amounts stop
 * moving with the formula — which is the point — so nothing happens until the admin confirms.
 */
export function FinalizeModal({
  row,
  onCancel,
  onFinalized,
}: Readonly<{
  row: InvoiceRow;
  onCancel: () => void;
  /** The invoice was frozen; the invoice reads again. */
  onFinalized: () => void;
}>) {
  const [refusal, setRefusal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A bonus still waiting for data is frozen at what was measured: the dialog shows that, not the
  // running "Menunggu data", so the admin confirms the amounts that will be kept.
  const pending = row.pendingBonus;

  async function confirm() {
    setBusy(true);
    setRefusal(null);
    try {
      const outcome = await finalizeInvoice(row.contractId, { acceptPendingBonus: pending !== null });
      if (outcome.ok) {
        onFinalized();
        return;
      }
      setRefusal(outcome.message);
    } catch {
      setRefusal("Permintaan tidak dapat diproses. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Finalize invoice ${row.creatorName}`}
      onClose={onCancel}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Batal
          </Button>
          <Button variant="danger" onClick={confirm} disabled={busy}>
            Finalize
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-[13px]">
          Setelah difinalisasi, semua nominal dikunci dan tidak berubah lagi meski formula atau
          data konten berubah.
        </p>

        {pending ? (
          <p role="note" className="rounded-(--radius-control) bg-amber-wash px-3 py-2 text-[13px] text-amber-ink">
            Bonus performa masih menunggu data. Jika difinalisasi sekarang, bonus dikunci sebesar
            yang sudah terukur dan konten tanpa data dihitung Rp0. Tambahkan penyesuaian dulu jika
            masih ada bonus yang perlu dibayar.
          </p>
        ) : null}

        <dl className="flex flex-col gap-1.5 text-[13px]">
          <div className="flex items-start justify-between gap-4">
            <dt>Fixed Rate</dt>
            <dd className="whitespace-nowrap tabular-nums">{amountLabel(row.fixedAmount)}</dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt>Konten Tambahan</dt>
            <dd className="whitespace-nowrap tabular-nums">{amountLabel(row.extraAmount)}</dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt>Bonus</dt>
            <dd className="whitespace-nowrap tabular-nums">
              {bonusLabel(pending ? pending.amount : row.bonusAmount)}
            </dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt>Penalti</dt>
            <dd className="whitespace-nowrap tabular-nums">{penaltyLabel(row.penaltyAmount)}</dd>
          </div>
        </dl>

        {row.adjustments.length > 0 ? (
          <section aria-label="Penyesuaian manual" className="flex flex-col gap-1.5">
            <h3 className="text-[13px] font-bold">Penyesuaian</h3>
            <AdjustmentLines adjustments={row.adjustments} />
          </section>
        ) : null}

        <div
          role="group"
          aria-label="Total invoice"
          className="flex items-start justify-between gap-4 border-t border-rule pt-3"
        >
          <p className="text-sm font-bold">Total</p>
          <strong className="whitespace-nowrap text-sm tabular-nums">
            {finalLabel(pending ? { ...row, floored: pending.floored, totalAmount: pending.totalAmount } : row)}
          </strong>
        </div>

        {refusal ? (
          <p role="alert" className="text-[13px] text-red-ink">
            {refusal}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
