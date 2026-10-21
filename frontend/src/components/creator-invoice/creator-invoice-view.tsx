"use client";

import { useState, type ReactNode } from "react";
import { InfoTip } from "@/components/ui/info-tip";
import {
  creatorNextStep,
  invoiceActivity,
  invoiceSteps,
  totalAmountLabel,
  totalLabel,
  totalNote,
  type CreatorInvoice,
  type CreatorInvoiceAction,
  type CreatorNextStep,
  type InvoiceComment,
} from "@/lib/creator-invoice";
import { formatContractWindow } from "@/lib/format";
import { InvoiceActivity } from "./invoice-activity";
import { InvoiceParts, ProofLink } from "./invoice-parts";
import { InvoiceTabs } from "./invoice-tabs";
import { InvoiceTracker } from "./invoice-tracker";

/**
 * Whose turn the invoice is: the creator's, as a banner with the move beside the ask (and the
 * proof right there when the ask is about it), or the admin's, as a quiet line saying so.
 */
function NextStep({
  next,
  invoice,
  renderAction,
}: Readonly<{
  next: CreatorNextStep;
  invoice: CreatorInvoice;
  renderAction?: (action: CreatorInvoiceAction) => ReactNode;
}>) {
  if (next.action === null) {
    if (next.hint === null) return null;
    return <p className={`mt-2.5 text-xs ${invoice.status === "paid" ? "text-green-ink" : "text-muted"}`}>{next.hint}</p>;
  }

  return (
    <section
      aria-label="Giliran kamu"
      className="mt-3 mb-1 flex flex-wrap items-center justify-between gap-2.5 rounded-(--radius-control) border border-accent bg-accent-wash px-3 py-2.5 text-[12.5px]"
    >
      <span>{next.hint}</span>
      <span className="flex flex-wrap items-center gap-2">
        {next.action === "confirm" && invoice.proof !== null ? <ProofLink proof={invoice.proof} /> : null}
        {renderAction?.(next.action)}
      </span>
    </section>
  );
}

type InvoiceTab = "rincian" | "aktivitas";

/**
 * One invoice as its creator reads it (PBI-13, subtask 13.3), laid out as the prototype's
 * Pembayaran page: the total and how far the invoice has walked, the creator's turn when it is
 * theirs, then two tabs: Rincian, each part with its lines, and Aktivitas & Komentar, the
 * invoice's story and its thread.
 *
 * The lines are the admin's own components (BreakdownLines, AdjustmentLines), so an admin and a
 * creator always read the same numbers in the same words — the prototype's "one source" for
 * both roles. The moves themselves come in through `renderAction` (Dependency Inversion): this
 * view decides when a move is due and leaves how it is made to its caller.
 */
export function CreatorInvoiceView({
  invoice,
  onOpenContent,
  renderAction,
  onCommented,
}: Readonly<{
  invoice: CreatorInvoice;
  /** Called with the id of the content whose name was pressed. */
  onOpenContent: (contentId: string) => void;
  /** The control for the creator's move, when one is due. */
  renderAction?: (action: CreatorInvoiceAction) => ReactNode;
  /** A comment was saved but not sent back; the invoice reads again to show it. */
  onCommented: () => void;
}>) {
  // Comments sent from here, shown at once instead of reading every invoice again for one line.
  // Once a read brings one back with the invoice, it is shown from there and not twice.
  const [sent, setSent] = useState<InvoiceComment[]>([]);
  const known = new Set(invoice.comments.map((comment) => comment.id));
  const shown = { ...invoice, comments: [...invoice.comments, ...sent.filter((comment) => !known.has(comment.id))] };

  const label = totalLabel(invoice.status);
  const note = totalNote(invoice.status);
  const next = creatorNextStep(invoice);
  const total = totalAmountLabel(invoice);
  const activityCount = invoiceActivity(shown).length;
  const [tab, setTab] = useState<InvoiceTab>("rincian");

  return (
    <div>
      <div role="group" aria-label="Ringkasan invoice">
        <p className="text-sm font-semibold">{invoice.breakdown.creatorName}</p>
        <p className="mt-0.5 text-xs text-muted">
          {`Periode ${invoice.periodNumber} · ${formatContractWindow(invoice.periodStart, invoice.periodEnd)}`}
        </p>
        <p className="mt-3 flex items-center gap-1 text-xs text-muted">
          {label}
          {note === null ? null : <InfoTip text={note} label={`Tentang ${label}`} />}
        </p>
        <p className="mt-0.5 text-[26px] leading-tight font-bold tabular-nums">{total}</p>
      </div>

      <InvoiceTracker steps={invoiceSteps(invoice)} />

      <NextStep next={next} invoice={invoice} renderAction={renderAction} />

      <InvoiceTabs
        tabs={[
          { key: "rincian", label: "Rincian" },
          {
            key: "aktivitas",
            label: `Aktivitas & Komentar${activityCount > 0 ? ` (${activityCount})` : ""}`,
          },
        ]}
        active={tab}
        onSelect={setTab}
      >
        {tab === "rincian" ? (
          <InvoiceParts invoice={invoice} onOpenContent={onOpenContent} />
        ) : (
          <InvoiceActivity
            invoice={shown}
            onCommented={(comment) => (comment ? setSent((was) => [...was, comment]) : onCommented())}
          />
        )}
      </InvoiceTabs>
    </div>
  );
}
