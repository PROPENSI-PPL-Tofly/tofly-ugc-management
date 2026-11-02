"use client";

import { useId, useState, type ReactNode } from "react";
import { AdjustmentLines } from "@/components/invoicing/adjustment-lines";
import { BreakdownLines } from "@/components/invoicing/breakdown-popup";
import {
  creatorNextStep,
  instantDay,
  totalAmountLabel,
  totalLabel,
  type CreatorInvoice,
  type PaymentProof,
} from "@/lib/creator-invoice";
import { adjustmentLabel } from "@/lib/invoice-adjustment";
import { amountLabel, bonusLabel, DASH, penaltyLabel } from "@/lib/invoice";
import { BREAKDOWN_KINDS, BREAKDOWN_TITLES, breakdownPopup, type BreakdownKind } from "@/lib/invoice-breakdown";

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
export function ProofLink({ proof }: Readonly<{ proof: PaymentProof }>) {
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

/** The Rincian tab: each part with its lines, the adjustments, the total and the proof. */
export function InvoiceParts({
  invoice,
  onOpenContent,
}: Readonly<{ invoice: CreatorInvoice; onOpenContent: (contentId: string) => void }>) {
  const label = totalLabel(invoice.status);
  const total = totalAmountLabel(invoice);
  const adjusted = invoice.adjustments.reduce((sum, adjustment) => sum + adjustment.amount, 0);
  // While the proof waits for the creator's confirmation, it is linked where they are asked.
  const rowProof = creatorNextStep(invoice).action === "confirm" ? null : invoice.proof;

  return (
    <div className="mt-2">
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
          className="mt-2 flex items-start justify-between gap-4 rounded-(--radius-control) bg-ink px-3 py-3 text-accent-ink"
        >
          <div>
            <p className="text-sm font-bold">{label}</p>
            {invoice.floored ? (
              <p className="text-xs font-semibold text-red-wash">Penalti melebihi pendapatan, total minimal Rp0.</p>
            ) : null}
            {invoice.bonusAmount === null ? (
              <p className="text-xs text-rule">Belum termasuk bonus performa yang menunggu data.</p>
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
  );
}
