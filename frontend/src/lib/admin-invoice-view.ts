// The admin's Rincian Invoice read as the creator's Pembayaran page reads an invoice (B2.1), so
// both roles see one invoice in one layout: the total, the dated tracker and the parts. The
// admin's row and breakdown come from Rate & Invoicing; this adapts them to the creator view's
// shape and words the parts that differ by role. Pure module: no React, no next/headers.
//
// Adapter: the tracker, the parts and the activity are the creator page's components, written
// against CreatorInvoice. Translating the admin's InvoiceRow into it here keeps those components
// role-blind instead of teaching each one a second input.

import type { CreatorInvoice, ReachedAt } from "./creator-invoice";
import { formatDate } from "./format";
import type { InvoiceRow, InvoiceStatus } from "./invoice";
import type { InvoiceBreakdown } from "./invoice-breakdown";

/** One admin invoice as the shared invoice view reads it. */
export function adminInvoiceView(row: InvoiceRow, breakdown: InvoiceBreakdown): CreatorInvoice {
  const { period, notStarted } = breakdown.fixed;
  const proof = row.payment?.proof ?? null;

  return {
    contractId: row.contractId,
    periodNumber: row.periodNumber,
    // The breakdown names the period; the row's last day stands in on an answer that does not.
    periodStart: period.start ?? row.contractEnd,
    periodEnd: period.end ?? row.contractEnd,
    notStarted,
    status: row.invoiceStatus,
    fixedAmount: row.fixedAmount,
    extraAmount: row.extraAmount,
    bonusAmount: row.bonusAmount,
    penaltyAmount: row.penaltyAmount,
    adjustments: row.adjustments,
    totalAmount: row.totalAmount,
    floored: row.floored,
    breakdown,
    reachedAt: {
      finalized: row.frozenAt,
      creator_acked: row.payment?.acknowledgedAt ?? null,
      payment_uploaded: proof?.uploadedAt ?? null,
      paid: row.payment?.receivedAt ?? null,
    },
    // The adapter already dropped a link the page may not offer; null names the file without one.
    proof: proof ? { url: proof.href, fileName: proof.fileName, uploadedAt: proof.uploadedAt } : null,
    // The admin's thread reads its own comments (InvoiceComments); none ride on the row.
    comments: [],
  };
}

/** The total's name for the admin, as the prototype gives it: a running total until frozen. */
export function adminTotalLabel(status: InvoiceStatus): string {
  if (status === "accruing") return "Total Sementara";
  return status === "paid" ? "Total Dibayarkan" : "Total Final";
}

/** Until the creator acknowledges, an adjustment can still move the total. */
export function adminTotalNote(status: InvoiceStatus): string | null {
  return status === "accruing" || status === "finalized" ? "Bisa berubah sampai creator ack invoice." : null;
}

/** The calendar day after another, "YYYY-MM-DD", across a month or a year. */
function dayAfter(day: string): string {
  const next = new Date(`${day}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

const WAITING_HINTS: Partial<Record<InvoiceStatus, string>> = {
  finalized: "Menunggu ack creator.",
  payment_uploaded: "Menunggu konfirmasi creator.",
  paid: "Lunas",
};

/**
 * The footer's line, by the prototype: when a running invoice can be finalized, whose move a
 * frozen one waits on, or that it is paid. Null where the buttons beside it already say it.
 * `lastDay` is the contract's last counted day; finalizing opens the day after it.
 */
export function adminInvoiceHint(
  invoice: Pick<CreatorInvoice, "status" | "notStarted">,
  lastDay: string,
  today: string,
): string | null {
  if (invoice.notStarted) return "Kontrak belum dimulai.";
  if (invoice.status === "accruing") {
    return today > lastDay ? null : `Finalize mulai ${formatDate(dayAfter(lastDay))}.`;
  }
  return WAITING_HINTS[invoice.status] ?? null;
}

/** Each step past Berjalan as the admin reads it in the activity. */
export const ADMIN_EVENT_TEXT: Record<keyof ReachedAt, string> = {
  finalized: "Invoice difinalisasi",
  creator_acked: "Creator meng-acknowledge invoice",
  payment_uploaded: "Bukti bayar dikirim ke creator",
  paid: "Creator mengonfirmasi pembayaran diterima",
};
