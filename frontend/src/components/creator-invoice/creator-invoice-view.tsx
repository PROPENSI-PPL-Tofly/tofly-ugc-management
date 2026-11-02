"use client";

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
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
      className="mt-3 mb-1 flex flex-wrap items-center justify-between gap-2.5 rounded-(--radius-control) border-[1.5px] border-accent bg-accent-wash px-3 py-2.5 text-[12.5px]"
    >
      <span>
        {/* Seen, not read: the region already carries the name, and capitals get spelled out. */}
        <span aria-hidden="true" className="block text-[11px] font-extrabold uppercase tracking-wide text-accent-deep">
          Giliran kamu
        </span>
        {next.hint}
      </span>
      <span className="flex flex-wrap items-center gap-2">
        {next.action === "confirm" && invoice.proof !== null ? <ProofLink proof={invoice.proof} /> : null}
        {renderAction?.(next.action)}
      </span>
    </section>
  );
}

type InvoiceTab = "rincian" | "aktivitas";

const TAB_ORDER: readonly InvoiceTab[] = ["rincian", "aktivitas"];

/**
 * The tab a key moves to, as the WAI-ARIA tab pattern (and StatusTabs) has it: the arrows step
 * with wrap-around, Home and End jump to either end; any other key moves nowhere.
 */
function tabFor(key: string, from: InvoiceTab): InvoiceTab | null {
  const index = TAB_ORDER.indexOf(from);
  const last = TAB_ORDER.length - 1;
  const targets: Partial<Record<string, number>> = {
    ArrowRight: index === last ? 0 : index + 1,
    ArrowLeft: index === 0 ? last : index - 1,
    Home: 0,
    End: last,
  };
  const target = targets[key];
  return target === undefined ? null : TAB_ORDER[target];
}

/** One tab of the view: one Tab stop for the list, brand blue for the open one, as StatusTabs. */
function Tab({
  id,
  panel,
  selected,
  onSelect,
  onKey,
  children,
}: Readonly<{
  id: string;
  panel: string;
  selected: boolean;
  onSelect: () => void;
  onKey: (event: KeyboardEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}>) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-selected={selected}
      aria-controls={panel}
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      onKeyDown={onKey}
      className={`-mb-px cursor-pointer border-x-0 border-t-0 border-b-2 bg-transparent px-2.5 py-2 text-[12.5px] font-semibold ${selected ? "border-accent text-accent-deep" : "border-transparent text-muted hover:text-ink"}`}
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
  const tabsId = useId();
  const panelId = useId();

  function moveTab(event: KeyboardEvent<HTMLButtonElement>) {
    const next = tabFor(event.key, tab);
    if (next === null) return;
    event.preventDefault();
    setTab(next);
    document.getElementById(`${tabsId}-${next}`)?.focus();
  }

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
        <Tab id={`${tabsId}-rincian`} panel={panelId} selected={tab === "rincian"} onSelect={() => setTab("rincian")} onKey={moveTab}>
          Rincian
        </Tab>
        <Tab id={`${tabsId}-aktivitas`} panel={panelId} selected={tab === "aktivitas"} onSelect={() => setTab("aktivitas")} onKey={moveTab}>
          Aktivitas &amp; Komentar
          {activityCount > 0 ? ` (${activityCount})` : null}
        </Tab>
      </div>

      <div role="tabpanel" id={panelId} aria-labelledby={`${tabsId}-${tab}`}>
        {tab === "rincian" ? (
          <InvoiceParts invoice={invoice} onOpenContent={onOpenContent} />
        ) : (
          <InvoiceActivity
            invoice={shown}
            onCommented={(comment) => (comment ? setSent((was) => [...was, comment]) : onCommented())}
          />
        )}
      </div>
    </div>
  );
}
