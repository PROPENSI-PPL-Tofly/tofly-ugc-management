"use client";

import { useId, useState, type ReactNode } from "react";
import { BreakdownLines } from "@/components/invoicing/breakdown-popup";
import { AdjustmentLines } from "@/components/invoicing/adjustment-lines";
import { InfoTip } from "@/components/ui/info-tip";
import {
  creatorNextStep,
  instantDay,
  invoiceSteps,
  totalAmountLabel,
  totalLabel,
  totalNote,
  type CreatorInvoice,
  type CreatorInvoiceAction,
  type CreatorNextStep,
  type PaymentProof,
} from "@/lib/creator-invoice";
import { formatContractWindow } from "@/lib/format";
import { adjustmentLabel } from "@/lib/invoice-adjustment";
import { amountLabel, bonusLabel, DASH, penaltyLabel } from "@/lib/invoice";
import { BREAKDOWN_KINDS, BREAKDOWN_TITLES, breakdownPopup, type BreakdownKind } from "@/lib/invoice-breakdown";
import { InvoiceTracker } from "./invoice-tracker";

const ROW = "flex items-center justify-between gap-3 px-0.5 py-2.5 text-[13px]";
const AMOUNT = "whitespace-nowrap tabular-nums";

/** One part's row: a toggle that unfolds its lines, or a plain row when it has none. */
function Part({
  title,
  label = title,
  amount,
  tone = "",
  children,
}: Readonly<{
  title: string;
  /** What the row reads, when it says more than the title. */
  label?: ReactNode;
  amount: string;
  tone?: string;
  /** The lines; none makes the row plain, with nothing to open. */
  children?: ReactNode;
}>) {
  const [open, setOpen] = useState(false);
  const linesId = useId();

  return (
    <div role="group" aria-label={title} className="border-b border-rule">
      {children ? (
        <>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={linesId}
            onClick={() => setOpen((was) => !was)}
            className={`${ROW} w-full cursor-pointer border-none bg-transparent text-left hover:bg-surface-2`}
          >
            <span>
              {label}
              <span aria-hidden="true" className={`ml-1.5 inline-block text-[11px] text-muted transition-transform ${open ? "rotate-90" : ""}`}>
                ▸
              </span>
            </span>
            <span className={`${AMOUNT} ${tone}`}>{amount}</span>
          </button>
          {open ? (
            <div id={linesId} className="flex flex-col gap-1.5 pb-2.5 pl-3">
              {children}
            </div>
          ) : null}
        </>
      ) : (
        <div className={ROW}>
          <span>{label}</span>
          <span className={`${AMOUNT} text-muted`}>{amount}</span>
        </div>
      )}
    </div>
  );
}

/**
 * The proof as a link that opens in its own tab. noopener keeps the file's page from reaching
 * back into this one, noreferrer keeps the signed link out of anyone's logs (OWASP A01). A link
 * that did not pass the adapter's https check is named and never linked.
 */
function ProofLink({ proof }: Readonly<{ proof: PaymentProof }>) {
  if (proof.url === null) return <span className="wrap-anywhere">{proof.fileName}</span>;
  return (
    <a
      href={proof.url}
      target="_blank"
      rel="noopener noreferrer"
      className="font-semibold text-accent-deep underline-offset-2 hover:underline"
    >
      Lihat Bukti
    </a>
  );
}

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

function amountOf(kind: BreakdownKind, invoice: CreatorInvoice): { amount: string; tone: string } {
  switch (kind) {
    case "fixed":
      return { amount: amountLabel(invoice.fixedAmount), tone: "" };
    case "extra":
      return { amount: amountLabel(invoice.extraAmount), tone: "" };
    case "bonus":
      return { amount: bonusLabel(invoice.bonusAmount), tone: invoice.bonusAmount === null ? "text-muted" : "" };
    case "penalty":
      // Only a charged penalty has lines to open; a part with none is drawn plain, so red is safe.
      return { amount: penaltyLabel(invoice.penaltyAmount), tone: "text-red-ink" };
  }
}

/**
 * One invoice as its creator reads it (PBI-13, subtask 13.3), laid out as the prototype's
 * Pembayaran page: the total and how far the invoice has walked, the creator's turn when it is
 * theirs, then each part with its lines, the adjustments, the total and the proof.
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
}: Readonly<{
  invoice: CreatorInvoice;
  /** Called with the id of the content whose name was pressed. */
  onOpenContent: (contentId: string) => void;
  /** The control for the creator's move, when one is due. */
  renderAction?: (action: CreatorInvoiceAction) => ReactNode;
}>) {
  const label = totalLabel(invoice.status);
  const note = totalNote(invoice.status);
  const next = creatorNextStep(invoice);
  const total = totalAmountLabel(invoice);
  const adjusted = invoice.adjustments.reduce((sum, adjustment) => sum + adjustment.amount, 0);
  // While the proof waits for the creator's confirmation, it is linked where they are asked.
  const rowProof = next.action === "confirm" ? null : invoice.proof;

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

      <div className="mt-4">
        {BREAKDOWN_KINDS.map((kind) => {
          const view = breakdownPopup(kind, invoice.breakdown);
          // The bonus always opens: the creator can read the tiers before earning one.
          const opens = view.lines.length > 0 || kind === "bonus";
          const { amount, tone } = amountOf(kind, invoice);
          return (
            <Part
              key={kind}
              title={BREAKDOWN_TITLES[kind]}
              label={
                kind === "fixed" && invoice.notStarted ? (
                  <>
                    {BREAKDOWN_TITLES.fixed} <span className="text-muted">· belum dimulai</span>
                  </>
                ) : undefined
              }
              amount={amount}
              tone={tone}
            >
              {opens ? <BreakdownLines kind={kind} breakdown={invoice.breakdown} onOpenContent={onOpenContent} /> : null}
            </Part>
          );
        })}

        <Part title="Penyesuaian" amount={invoice.adjustments.length > 0 ? adjustmentLabel(adjusted) : DASH}>
          {invoice.adjustments.length > 0 ? <AdjustmentLines adjustments={invoice.adjustments} /> : null}
        </Part>

        <div
          role="group"
          aria-label="Total invoice"
          className="-mt-px flex items-start justify-between gap-4 border-t-[1.5px] border-ink px-0.5 pt-3 pb-1"
        >
          <div>
            <p className="text-sm font-bold">{label}</p>
            {invoice.floored ? (
              <p className="text-xs text-red-ink">Penalti melebihi pendapatan, total minimal Rp0.</p>
            ) : null}
            {invoice.bonusAmount === null ? (
              <p className="text-xs text-muted">Belum termasuk bonus performa yang menunggu data.</p>
            ) : null}
          </div>
          <strong className={`${AMOUNT} text-sm`}>{total}</strong>
        </div>

        {rowProof ? (
          <div role="group" aria-label="Bukti Bayar" className={`${ROW} border-b border-rule`}>
            <span>
              Bukti Bayar
              <span className="block text-xs text-muted">{`Diupload ${instantDay(rowProof.uploadedAt) ?? DASH}`}</span>
            </span>
            <ProofLink proof={rowProof} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
