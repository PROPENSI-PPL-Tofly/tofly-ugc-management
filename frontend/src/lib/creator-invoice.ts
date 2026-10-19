// The creator's invoice page, Pembayaran (PBI-13, subtask 13.3): the creator's own invoices in
// the page's names, and the rules the page reads them by — what the total is called, how far the
// invoice has walked, and what the creator is asked to do next. Pure module: no React and no
// next/headers, so the server page, the client components and the tests all share it.
//
// The amounts and the breakdown are the backend's. Nothing here adds them up again, so the
// creator reads exactly what the admin froze.

import type { AdjustmentLine } from "./invoice-adjustment";
import type { InvoiceStatus } from "./invoice";
import type { InvoiceBreakdown } from "./invoice-breakdown";
import { formatDate, jakartaDay } from "./format";
import type { Role } from "./session";

/** The page's own address. */
export const CREATOR_INVOICES_PATH = "/creator/payments";

/** The payment proof an admin uploaded (13.2). */
export interface PaymentProof {
  /**
   * Where the file opens, an https link; null when the backend sent one that is not, so the
   * page names the file without a link that could run or leak anything.
   */
  url: string | null;
  fileName: string;
  /** ISO instant. */
  uploadedAt: string;
}

/** One message in an invoice's thread, from the admin or the creator (13.2). */
export interface InvoiceComment {
  id: string;
  authorName: string;
  authorRole: Role;
  text: string;
  /** ISO instant. */
  createdAt: string;
}

/** The steps past Berjalan, each dated when the invoice reached it. */
export type ReachedAt = Record<Exclude<InvoiceStatus, "accruing">, string | null>;

/** One of the creator's invoices, one per contract. */
export interface CreatorInvoice {
  contractId: string;
  /** Which of the creator's contracts this is, from 1 in the order they started. */
  periodNumber: number;
  /** Plain calendar days, YYYY-MM-DD. */
  periodStart: string;
  periodEnd: string;
  /** True for a contract that has not started: nothing is billed yet. */
  notStarted: boolean;
  status: InvoiceStatus;
  fixedAmount: number;
  extraAmount: number;
  /** Null while the performance data is not in (PBI-19): unknown, never a zero. */
  bonusAmount: number | null;
  penaltyAmount: number;
  adjustments: AdjustmentLine[];
  /** What is owed, never below zero. */
  totalAmount: number;
  /** True when the penalty outweighed the pay and the total was held at zero. */
  floored: boolean;
  breakdown: InvoiceBreakdown;
  reachedAt: ReachedAt;
  proof: PaymentProof | null;
  /** Oldest first. */
  comments: InvoiceComment[];
}

/** A failed read of the creator's invoices, with the HTTP status that says why. */
export class CreatorInvoicesError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Loading your invoices failed with HTTP ${status}`);
    this.name = "CreatorInvoicesError";
    this.status = status;
  }
}

/** The total's name as the prototype gives it to a creator: an estimate until it is frozen. */
export function totalLabel(status: InvoiceStatus): string {
  if (status === "accruing") return "Estimasi Pendapatan";
  return status === "paid" ? "Total Dibayarkan" : "Total Final";
}

/** Until the creator acknowledges, an adjustment can still move the total; the page says so. */
export function totalNote(status: InvoiceStatus): string | null {
  return status === "accruing" || status === "finalized"
    ? "Bisa berubah sampai kamu acknowledge invoice."
    : null;
}

/** The pipeline in the order it walks, with the tracker's words for each step. */
const STEPS: readonly { status: InvoiceStatus; label: string }[] = [
  { status: "accruing", label: "Berjalan" },
  { status: "finalized", label: "Final" },
  { status: "creator_acked", label: "Di-ack Creator" },
  { status: "payment_uploaded", label: "Bukti Bayar" },
  { status: "paid", label: "Paid" },
];

export type StepState = "done" | "current" | "todo";

export interface InvoiceStep {
  status: InvoiceStatus;
  label: string;
  state: StepState;
  /** The day the step was reached, as the page writes it; null before then. */
  caption: string | null;
}

/**
 * The calendar day in Jakarta an instant fell on, written as the page writes days; null for no
 * instant or one that cannot be read.
 */
export function instantDay(instant: string | null): string | null {
  if (instant === null) return null;
  const moment = new Date(instant);
  return Number.isNaN(moment.getTime()) ? null : formatDate(jakartaDay(moment));
}

/**
 * The dated tracker under the total: every step before the invoice's own is done, its own is
 * current, and a paid invoice has walked them all. A contract that has not started has no step
 * yet; its first step says when it begins.
 */
export function invoiceSteps(invoice: CreatorInvoice): InvoiceStep[] {
  const current = invoice.notStarted ? -1 : STEPS.findIndex((step) => step.status === invoice.status);

  return STEPS.map((step, index) => {
    let state: StepState = "todo";
    if (index < current || (index === current && step.status === "paid")) state = "done";
    else if (index === current) state = "current";

    let caption: string | null;
    if (step.status === "accruing") {
      const start = formatDate(invoice.periodStart);
      caption = invoice.notStarted ? `mulai ${start}` : start;
    } else {
      caption = instantDay(invoice.reachedAt[step.status]);
    }

    return { status: step.status, label: step.label, state, caption };
  });
}

/** What the creator can do on the invoice: acknowledge it, or confirm the money arrived. */
export type CreatorInvoiceAction = "acknowledge" | "confirm";

export interface CreatorNextStep {
  hint: string | null;
  action: CreatorInvoiceAction | null;
}

const NEXT_STEPS: Record<InvoiceStatus, CreatorNextStep> = {
  // A running invoice is the admin's to finalize; the creator only watches it grow.
  accruing: { hint: null, action: null },
  finalized: { hint: "Cek rincian, lalu acknowledge.", action: "acknowledge" },
  creator_acked: { hint: "Menunggu bukti bayar dari Admin.", action: null },
  payment_uploaded: { hint: "Admin sudah mengirim bukti bayar.", action: "confirm" },
  paid: { hint: "Lunas", action: null },
};

/**
 * The creator's turn, as the prototype's banner words it. Acknowledge is offered only on a
 * finalized invoice and confirm only once the proof is in (13.3); the backend refuses either
 * anywhere else, so the page never offers a move that would only be refused.
 */
export function creatorNextStep(invoice: Pick<CreatorInvoice, "status" | "notStarted">): CreatorNextStep {
  if (invoice.notStarted) return { hint: "Kontrak belum dimulai.", action: null };
  return NEXT_STEPS[invoice.status];
}

/**
 * The latest contract's invoice for the top of the page, and the earlier ones for the history
 * below it, latest first. Ordered here by period rather than trusted to the answer's order.
 */
export function currentAndHistory(invoices: readonly CreatorInvoice[]): {
  current: CreatorInvoice | null;
  history: CreatorInvoice[];
} {
  const [current = null, ...history] = [...invoices].sort((a, b) => b.periodNumber - a.periodNumber);
  return { current, history };
}
