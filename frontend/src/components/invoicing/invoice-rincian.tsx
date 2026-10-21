"use client";

import { useState, type ReactNode } from "react";
import { InvoiceParts } from "@/components/creator-invoice/invoice-parts";
import { InvoiceTabs } from "@/components/creator-invoice/invoice-tabs";
import { InvoiceTracker } from "@/components/creator-invoice/invoice-tracker";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { Modal } from "@/components/ui/modal";
import {
  ADMIN_EVENT_TEXT,
  adminInvoiceHint,
  adminInvoiceView,
  adminTotalLabel,
  adminTotalNote,
} from "@/lib/admin-invoice-view";
import { instantDay, invoiceActivity, invoiceSteps, totalAmountLabel } from "@/lib/creator-invoice";
import { formatContractWindow, jakartaDay } from "@/lib/format";
import type { InvoiceRow } from "@/lib/invoice";
import type { InvoiceBreakdown } from "@/lib/invoice-breakdown";
import type { BreakdownStatus } from "./breakdown-popup";

type RincianTab = "rincian" | "aktivitas";

/**
 * One creator's invoice for the admin (the prototype's "Rincian"), in the layout the creator's
 * Pembayaran page reads it in: who and which period, the total, the dated tracker, then two
 * tabs. Rincian folds each part open on a press, so the admin scans five amounts before any
 * line; Aktivitas & Komentar tells the invoice's story beside its thread. The tracker, the parts
 * and the tabs are the creator page's own components, fed through adminInvoiceView, so both
 * roles always read the same numbers in the same words.
 *
 * The moves stay the caller's: `actions` beside Tutup, `editor` (the adjustment form) and
 * `upload` (the payment proof) above the tabs where the admin acts, `thread` under the activity.
 * The footer says what the invoice waits for, so a missing button is never a silent one.
 */
export function InvoiceRincian({
  row,
  breakdown,
  status,
  onRetry,
  onClose,
  onOpenContent,
  actions,
  editor,
  upload,
  thread,
  today = jakartaDay(),
}: Readonly<{
  row: InvoiceRow;
  /** Null until it has been read, and when there is none. */
  breakdown: InvoiceBreakdown | null;
  status: BreakdownStatus;
  onRetry: () => void;
  onClose: () => void;
  onOpenContent: (contentId: string) => void;
  actions?: ReactNode;
  /** A form opened from the actions (the manual adjustment), shown above what it changes. */
  editor?: ReactNode;
  /** The payment proof upload, while the invoice waits for it. */
  upload?: ReactNode;
  /** The invoice's comment thread, under its activity. */
  thread?: ReactNode;
  /** The day the finalize hint is read against; Jakarta's, unless a test says otherwise. */
  today?: string;
}>) {
  const [tab, setTab] = useState<RincianTab>("rincian");
  const view = breakdown ? adminInvoiceView(row, breakdown) : null;

  let body: ReactNode;
  let hint: string | null = null;
  if (status === "failed") {
    body = (
      <div role="alert" className="flex flex-col items-center gap-3 py-6 text-center text-[13px]">
        <p>Rincian tidak bisa dimuat.</p>
        <Button onClick={onRetry}>Coba lagi</Button>
      </div>
    );
  } else if (status === "missing") {
    body = <p className="py-6 text-center text-[13px] text-muted">Tidak ada rincian untuk creator ini.</p>;
  } else if (view === null) {
    body = (
      <p role="status" className="py-6 text-center text-[13px] text-muted">
        Memuat rincian…
      </p>
    );
  } else {
    hint = adminInvoiceHint(view, row.contractEnd, today);
    const label = adminTotalLabel(view.status);
    const note = adminTotalNote(view.status);
    const events = invoiceActivity(view, ADMIN_EVENT_TEXT);

    body = (
      <>
        <div role="group" aria-label="Ringkasan invoice">
          <p className="text-sm font-semibold">{row.creatorName}</p>
          <p className="mt-0.5 text-xs text-muted">
            {`Periode ${view.periodNumber} · ${formatContractWindow(view.periodStart, view.periodEnd)}`}
          </p>
          <p className="mt-3 flex items-center gap-1 text-xs text-muted">
            {label}
            {note === null ? null : <InfoTip text={note} label={`Tentang ${label}`} />}
          </p>
          <p className="mt-0.5 text-[26px] leading-tight font-bold tabular-nums">{totalAmountLabel(view)}</p>
        </div>

        <InvoiceTracker steps={invoiceSteps(view)} />

        {editor ? <div className="mt-4">{editor}</div> : null}
        {upload ? <div className="mt-4">{upload}</div> : null}

        <InvoiceTabs
          tabs={[
            { key: "rincian", label: "Rincian" },
            {
              key: "aktivitas",
              label: `Aktivitas & Komentar${events.length > 0 ? ` (${events.length})` : ""}`,
            },
          ]}
          active={tab}
          onSelect={setTab}
        >
          {tab === "rincian" ? (
            <InvoiceParts invoice={view} onOpenContent={onOpenContent} totalName={label} proof={view.proof} />
          ) : (
            <div className="flex flex-col gap-4">
              {events.length === 0 ? (
                <p className="py-3 text-center text-[13px] text-muted">Belum ada aktivitas.</p>
              ) : (
                <ul aria-label="Aktivitas invoice" className="divide-y divide-dashed divide-rule">
                  {events.map((event) => (
                    <li key={event.id} className="flex justify-between gap-3 py-2 text-[12.5px] text-muted">
                      <span>{event.text}</span>
                      <span className="whitespace-nowrap">{instantDay(event.at)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {thread}
            </div>
          )}
        </InvoiceTabs>
      </>
    );
  }

  return (
    <Modal
      title="Rincian Invoice"
      placement="side"
      onClose={onClose}
      footer={
        <>
          {hint === null ? null : (
            <p
              className={`mr-auto self-center text-xs ${view?.status === "paid" ? "font-semibold text-green-ink" : "text-muted"}`}
            >
              {hint}
            </p>
          )}
          {actions}
          <Button onClick={onClose}>Tutup</Button>
        </>
      }
    >
      {body}
    </Modal>
  );
}
