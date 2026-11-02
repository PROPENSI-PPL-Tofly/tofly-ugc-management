"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { syncNote, type LastSyncReport, type NamedLink, type WaitingLink } from "@/lib/finalize-sync";
import { finalizeInvoice } from "@/lib/invoice-actions.server";
import { DATA_STATE_LABELS, METRICS } from "@/lib/link-performance";
import { PLATFORM_LABELS } from "@/lib/platform-links";
import {
  amountLabel,
  bonusLabel,
  finalLabel,
  invoiceTitle,
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
  // PBI-28 AC 9: set once the server said the bonus still waits; Finalize tetap then accepts it.
  const [waiting, setWaiting] = useState<WaitingLink[] | null>(null);
  // PBI-28 AC 8: set once frozen while the last sync left links as they were.
  const [frozen, setFrozen] = useState<LastSyncReport | null>(null);
  // Freezing cannot be undone: focus starts on the safe answer, as ConfirmDialog does.
  const cancelRef = useRef<HTMLButtonElement>(null);
  // A bonus still waiting for data is frozen at what was measured: the dialog shows that, not the
  // running "Menunggu data", so the admin confirms the amounts that will be kept.
  const pending = row.pendingBonus;

  async function confirm() {
    setBusy(true);
    setRefusal(null);
    try {
      // The pending bonus is accepted only after the admin saw which links still wait (AC 9).
      const outcome = await finalizeInvoice(row.contractId, { acceptPendingBonus: waiting !== null });
      if (outcome.ok) {
        if (syncNote(outcome.lastSync) === null) onFinalized();
        else setFrozen(outcome.lastSync);
        return;
      }
      if (outcome.code === "INVOICE_BONUS_PENDING") {
        setWaiting(outcome.waiting ?? []);
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
      title={`Finalize invoice ${invoiceTitle(row)}`}
      onClose={onCancel}
      initialFocus={cancelRef}
      footer={
        frozen ? (
          <Button onClick={onFinalized}>Tutup</Button>
        ) : (
          <>
            <Button ref={cancelRef} variant="ghost" onClick={onCancel} disabled={busy}>
              Batal
            </Button>
            <Button variant="danger" onClick={confirm} disabled={busy}>
              {waiting ? "Finalize tetap" : "Finalize"}
            </Button>
          </>
        )
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

        {waiting ? <WaitingList links={waiting} /> : null}

        {busy ? (
          <p role="status" className="text-[13px] text-muted">
            Mengambil angka terbaru…
          </p>
        ) : null}

        {frozen ? <FrozenNote report={frozen} /> : null}

        {refusal ? (
          <p role="alert" className="text-[13px] text-red-ink">
            {refusal}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

const METRIC_LABELS = Object.fromEntries(METRICS.map(({ name, label }) => [name, label]));

function linkWords(link: NamedLink): string {
  return `${PLATFORM_LABELS[link.platform]} · ${DATA_STATE_LABELS[link.state]}`;
}

/**
 * The links whose bonus still waits (PBI-28 AC 9), each with its Content Detail, so the admin can
 * fill the numbers in there first, or freeze anyway with the button below.
 */
function WaitingList({ links }: Readonly<{ links: readonly WaitingLink[] }>) {
  return (
    <section className="flex flex-col gap-1.5 rounded-(--radius-control) bg-amber-wash px-3 py-2 text-[13px]">
      <p className="font-semibold text-amber-ink">
        Bonus konten ini belum ada datanya. Isi angkanya di Content Detail, atau finalize tetap.
      </p>
      <ul aria-label="Konten yang belum ada datanya" className="flex flex-col gap-1">
        {links.map((link) => (
          <li key={`${link.contentId}:${link.platform}`} className="flex flex-wrap items-center gap-x-2">
            <a
              href={`/admin/content-plan?content=${encodeURIComponent(link.contentId)}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Buka ${link.contentName}`}
              className="font-semibold text-accent-deep underline underline-offset-2"
            >
              {link.contentName}
            </a>
            <span className="text-ink-2">
              {PLATFORM_LABELS[link.platform]} · {METRIC_LABELS[link.metric]} · {DATA_STATE_LABELS[link.state]}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The invoice is frozen, but the last sync left these links on their stored numbers (AC 8). */
function FrozenNote({ report }: Readonly<{ report: LastSyncReport }>) {
  return (
    <section role="group" aria-label="Hasil sinkronisasi terakhir" className="flex flex-col gap-1.5 text-[13px]">
      <p className="font-semibold">Invoice difinalisasi.</p>
      <p>{syncNote(report)}</p>
      <ul aria-label="Link yang tidak diperbarui" className="flex flex-col gap-1">
        {report.notUpdated.map((link) => (
          <li key={`${link.contentId}:${link.platform}`}>
            {link.contentName} · {linkWords(link)}
          </li>
        ))}
      </ul>
    </section>
  );
}
