"use client";

import { useId, useState, type ReactNode } from "react";
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
} from "@/lib/creator-invoice";
import { formatContractWindow } from "@/lib/format";
import { InvoiceActivity } from "./invoice-activity";
import { InvoiceParts, ProofLink } from "./invoice-parts";
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

/** One tab of the view; the tablist moves between them. */
function Tab({
  id,
  panel,
  selected,
  onSelect,
  children,
}: Readonly<{ id: string; panel: string; selected: boolean; onSelect: () => void; children: ReactNode }>) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-selected={selected}
      aria-controls={panel}
      onClick={onSelect}
      className={`-mb-px cursor-pointer border-x-0 border-t-0 border-b-2 bg-transparent px-2.5 py-2 text-[12.5px] font-semibold ${selected ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}
    >
      {children}
    </button>
  );
}

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
  /** A comment was accepted; the invoice reads again. */
  onCommented: () => void;
}>) {
  const label = totalLabel(invoice.status);
  const note = totalNote(invoice.status);
  const next = creatorNextStep(invoice);
  const total = totalAmountLabel(invoice);
  const activityCount = invoiceActivity(invoice).length;
  const [tab, setTab] = useState<"rincian" | "aktivitas">("rincian");
  const tabsId = useId();
  const panelId = useId();

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

      <div role="tablist" aria-label="Bagian invoice" className="mt-3.5 mb-1.5 flex gap-1 border-b border-rule">
        <Tab id={`${tabsId}-rincian`} panel={panelId} selected={tab === "rincian"} onSelect={() => setTab("rincian")}>
          Rincian
        </Tab>
        <Tab id={`${tabsId}-aktivitas`} panel={panelId} selected={tab === "aktivitas"} onSelect={() => setTab("aktivitas")}>
          Aktivitas &amp; Komentar
          {activityCount > 0 ? ` (${activityCount})` : null}
        </Tab>
      </div>

      <div role="tabpanel" id={panelId} aria-labelledby={`${tabsId}-${tab}`}>
        {tab === "rincian" ? (
          <InvoiceParts invoice={invoice} onOpenContent={onOpenContent} />
        ) : (
          <InvoiceActivity invoice={invoice} onCommented={onCommented} />
        )}
      </div>
    </div>
  );
}
