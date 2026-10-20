"use client";

import type { ReactNode } from "react";
import { CONTRACT_TONES, INVOICE_TONES } from "@/components/invoice/invoice-table";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Pill, StatusDot } from "@/components/ui/pill";
import { FINAL_LABEL } from "@/lib/invoice-adjustment";
import {
  CONTRACT_STATUS_LABELS,
  finalLabel,
  invoiceTitle,
  INVOICE_STATUS_LABELS,
  type InvoiceRow,
} from "@/lib/invoice";
import { BREAKDOWN_KINDS, BREAKDOWN_TITLES, type InvoiceBreakdown } from "@/lib/invoice-breakdown";
import { AdjustmentLines } from "./adjustment-lines";
import { BreakdownLines, type BreakdownStatus } from "./breakdown-popup";

/**
 * One creator's whole running invoice in one place (the prototype's "Rincian"): every part with
 * its lines, in the table's order, then the total as the table shows it. It is what an admin
 * reads before paying a creator or answering a question about an amount; the four column popups
 * stay as shortcuts. A content's name opens its Content Detail, which the caller places.
 *
 * `actions` sits beside Tutup and is empty for now: the invoice pipeline (PBI-12) puts Finalize
 * there without this panel changing.
 */
export function InvoiceRincian({
  row,
  breakdown,
  status,
  onRetry,
  onClose,
  onOpenContent,
  actions,
  payment,
}: Readonly<{
  row: InvoiceRow;
  /** Null until it has been read, and when there is none. */
  breakdown: InvoiceBreakdown | null;
  status: BreakdownStatus;
  onRetry: () => void;
  onClose: () => void;
  onOpenContent: (contentId: string) => void;
  actions?: ReactNode;
  // The payment part (PBI-13, subtask 13.4), under the breakdown and its total.
  payment?: ReactNode;
}>) {
  let body: ReactNode;
  if (status === "failed") {
    body = (
      <div role="alert" className="flex flex-col items-center gap-3 py-6 text-center text-[13px]">
        <p>Rincian tidak bisa dimuat.</p>
        <Button onClick={onRetry}>Coba lagi</Button>
      </div>
    );
  } else if (status === "missing") {
    body = <p className="py-6 text-center text-[13px] text-muted">Tidak ada rincian untuk creator ini.</p>;
  } else if (breakdown === null) {
    body = (
      <p role="status" className="py-6 text-center text-[13px] text-muted">
        Memuat rincian…
      </p>
    );
  } else {
    body = (
      <div className="flex flex-col gap-5">
        {BREAKDOWN_KINDS.map((kind) => (
          <section key={kind} aria-label={BREAKDOWN_TITLES[kind]} className="flex flex-col gap-1.5">
            <h3 className="text-[13px] font-bold">{BREAKDOWN_TITLES[kind]}</h3>
            <BreakdownLines kind={kind} breakdown={breakdown} onOpenContent={onOpenContent} />
          </section>
        ))}

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
          <div>
            <p className="text-sm font-bold">Total</p>
            {row.floored ? <p className="text-xs text-red-ink">Penalti melebihi pembayaran</p> : null}
            {!row.floored && row.bonusAmount === null ? (
              <p className="text-xs text-muted">Belum termasuk bonus performa yang menunggu data.</p>
            ) : null}
          </div>
          <strong className="whitespace-nowrap text-sm tabular-nums">{finalLabel(row)}</strong>
        </div>
      </div>
    );
  }

  return (
    <Modal
      title={`Rincian Invoice · ${invoiceTitle(row)}`}
      placement="side"
      onClose={onClose}
      footer={
        <>
          {actions}
          <Button onClick={onClose}>Tutup</Button>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-3 text-[13px]">
        <StatusDot tone={CONTRACT_TONES[row.contractStatus]}>
          {`Kontrak ${CONTRACT_STATUS_LABELS[row.contractStatus]}`}
        </StatusDot>
        <Pill tone={INVOICE_TONES[row.invoiceStatus]}>{INVOICE_STATUS_LABELS[row.invoiceStatus]}</Pill>
        {/* A frozen invoice is settled history: the prototype's word marks it. */}
        {row.frozenAt !== null ? <Pill tone="green">{FINAL_LABEL}</Pill> : null}
      </div>
      {body}
      {payment}
    </Modal>
  );
}
