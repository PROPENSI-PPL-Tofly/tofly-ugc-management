"use client";

import { useRef, useState } from "react";
import { ContentNameButton } from "@/components/contents/content-row-buttons";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { finalizeInvoice } from "@/lib/invoice-actions.server";
import type { BonusGaps, NotUpdatedLink } from "@/lib/finalize-report";
import {
  amountLabel,
  bonusLabel,
  finalLabel,
  invoiceTitle,
  penaltyLabel,
  type InvoiceRow,
} from "@/lib/invoice";
import { DATA_STATE_LABELS } from "@/lib/link-performance";
import { PLATFORM_LABELS } from "@/lib/platform-links";
import { AdjustmentLines } from "./adjustment-lines";

/**
 * The confirmation before an invoice is frozen (PBI-12, subtask 12.2; PBI-28, 28.3): the whole
 * breakdown and the total, in the words the table writes them, and one question. After this the
 * amounts stop moving with the formula — which is the point — so nothing happens until the admin
 * confirms. The freeze runs the contract's last sync first (AC 7): what it left behind is named
 * before the dialog closes (AC 8), and what still waits for data is listed beside "Finalize
 * tetap", the informed freeze-anyway (AC 9).
 */
export function FinalizeModal({
  row,
  onCancel,
  onFinalized,
  onOpenContent,
}: Readonly<{
  row: InvoiceRow;
  onCancel: () => void;
  /** The invoice was frozen; the invoice reads again. */
  onFinalized: () => void;
  /** A waiting content is opened at its Content Detail, where its numbers can be typed (AC 9). */
  onOpenContent?: (contentId: string) => void;
}>) {
  const [refusal, setRefusal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The report's two lists: what the last sync left behind (shown before closing, AC 8) and what
  // still waits for data (shown beside Tetap Finalize, AC 9).
  const [leftBehind, setLeftBehind] = useState<NotUpdatedLink[] | null>(null);
  // Set once the server answered that the bonus still waits; gaps is null when its list was unreadable.
  const [waiting, setWaiting] = useState<{ gaps: BonusGaps | null } | null>(null);
  // Freezing cannot be undone: focus starts on the safe answer, as ConfirmDialog does.
  const cancelRef = useRef<HTMLButtonElement>(null);
  // A bonus still waiting for data is frozen at what was measured: the dialog shows that, not the
  // running "Menunggu data", so the admin confirms the amounts that will be kept.
  const pending = row.pendingBonus;

  /**
   * One press asks without accepting anything: the server answers what still waits (AC 9) and
   * "Tetap Finalize" is the freeze-anyway made with that list on screen. The run carries the
   * last sync (AC 7); the links it left behind are named before closing (AC 8).
   */
  async function confirm(acceptPendingBonus: boolean) {
    setBusy(true);
    setRefusal(null);
    try {
      const outcome = await finalizeInvoice(row.contractId, { acceptPendingBonus });
      if (outcome.ok) {
        const left = outcome.report.lastSync?.notUpdated ?? [];
        if (left.length > 0) {
          setLeftBehind(left);
          return;
        }
        onFinalized();
        return;
      }
      if (outcome.code === "INVOICE_BONUS_PENDING") {
        // The expected step before "Tetap Finalize", not an error: the list says what waits.
        setWaiting({ gaps: outcome.report.bonusGaps });
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
      // Once the report shows, the invoice is already frozen: every way out reads it again.
      onClose={leftBehind ? onFinalized : onCancel}
      initialFocus={cancelRef}
      footer={
        leftBehind ? (
          // The invoice is frozen; the report is what stands between the admin and closing.
          <Button onClick={onFinalized}>Selesai</Button>
        ) : (
          <>
            <Button ref={cancelRef} variant="ghost" onClick={onCancel} disabled={busy}>
              Batal
            </Button>
            <Button
              variant="danger"
              onClick={() => void confirm(waiting !== null)}
              disabled={busy}
            >
              {waiting ? "Tetap Finalize" : "Finalize"}
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

        {busy ? (
          <p role="status" className="text-[13px] text-muted">
            Mengambil angka terbaru dari Instagram dan TikTok…
          </p>
        ) : null}

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

        {waiting ? <WaitingGaps gaps={waiting.gaps} onOpenContent={onOpenContent} /> : null}
        {leftBehind ? <LeftBehind links={leftBehind} /> : null}

        {refusal ? (
          <p role="alert" className="text-[13px] text-red-ink">
            {refusal}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

/**
 * What still waits for data, beside "Tetap Finalize" (AC 9), worded as the prototype's banner:
 * each content with its state, its name opening the Content Detail where the admin can type the
 * missing numbers. An unreadable list says so, never an empty one, which would read as "nothing
 * is waiting".
 */
function WaitingGaps({
  gaps,
  onOpenContent,
}: Readonly<{ gaps: BonusGaps | null; onOpenContent?: (contentId: string) => void }>) {
  return (
    <div role="group" aria-label="Konten yang masih menunggu data">
      <h3 className="text-[13px] font-bold">Konten yang masih menunggu data</h3>
      {gaps === null ? (
        <p className="text-[13px] text-muted">Daftar konten yang menunggu data tidak dapat dimuat.</p>
      ) : gaps.waiting.length === 0 ? (
        <p className="text-[13px] text-muted">Tidak ada konten yang menunggu data.</p>
      ) : (
        <>
          <p className="text-[13px]">
            Bonus masih menunggu data untuk {gaps.waiting.length} link. Isi angkanya manual di Content
            Detail, atau tetap finalize: link tanpa data dikunci Rp0 dan bisa dikoreksi lewat
            penyesuaian sebelum creator ack.
          </p>
          <ul className="flex flex-col gap-1 text-[13px]">
            {gaps.waiting.map((link) => (
              <li key={`${link.contentId}:${link.platform}`}>
                {onOpenContent ? (
                  <ContentNameButton onOpen={() => onOpenContent(link.contentId)}>
                    {link.contentName}
                  </ContentNameButton>
                ) : (
                  link.contentName
                )}
                {" · "}
                {PLATFORM_LABELS[link.platform]} · <span>{DATA_STATE_LABELS[link.state]}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** The links the last sync did not update, named before the dialog closes (AC 8). */
function LeftBehind({ links }: Readonly<{ links: readonly NotUpdatedLink[] }>) {
  return (
    <div role="group" aria-label="Link yang tidak diperbarui">
      <h3 className="text-[13px] font-bold">
        {links.length} link tidak diperbarui, Finalize memakai angka yang tersimpan.
      </h3>
      <ul className="flex flex-col gap-1 text-[13px]">
        {links.map((link) => (
          <li key={`${link.contentId}:${link.platform}`}>
            {link.contentName} · {PLATFORM_LABELS[link.platform]} ·{" "}
            <span>{DATA_STATE_LABELS[link.state]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
