// The translation between the creator's Pembayaran page and GET /me/invoices (13.1, 13.2).
// Everything that knows the endpoint's shape lives here (Adapter), so the page and the API can
// change apart.
//
// The contract below is the one this page assumes until 13.1 and 13.2 land: each item is the
// admin's invoice detail (GET /invoices/:creatorId), so a creator reads the same breakdown the
// admin froze, plus when each payment step was reached, the proof and the comment thread. The
// backend answers only the signed-in creator's own invoices; the page never names a creator.

import type { CreatorInvoice, InvoiceComment, PaymentProof } from "./creator-invoice";
import { INVOICE_STATUSES } from "./invoice";
import { toInvoiceBreakdown, type RawInvoiceComponent, type RawInvoiceDetail } from "./invoice-api";

/** When each payment step was reached, ISO instants; null until it is. */
export interface RawInvoiceTimeline {
  finalizedAt: string | null;
  acknowledgedAt: string | null;
  proofUploadedAt: string | null;
  paidAt: string | null;
}

/** The proof the admin uploaded: a short-lived link to the file in Storage. */
export interface RawPaymentProof {
  url: string;
  fileName: string;
  uploadedAt: string;
}

export interface RawInvoiceComment {
  id: string;
  authorName: string;
  authorRole: "admin" | "creator";
  text: string;
  createdAt: string;
}

/** One of the signed-in creator's invoices. */
export interface RawCreatorInvoice extends RawInvoiceDetail {
  timeline: RawInvoiceTimeline;
  proof: RawPaymentProof | null;
  /** Oldest first. */
  comments: RawInvoiceComment[];
}

export interface RawCreatorInvoices {
  items: RawCreatorInvoice[];
}

const NO_TIMELINE: RawInvoiceTimeline = {
  finalizedAt: null,
  acknowledgedAt: null,
  proofUploadedAt: null,
  paidAt: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isComponent(value: unknown): value is RawInvoiceComponent {
  return isRecord(value) && Array.isArray(value.lines);
}

/**
 * Just what the page relies on to render without crashing: a list of invoices, each with its
 * contract, the four components with their lines, a numeric total and a status from the
 * pipeline. Anything else is a broken answer, shown as a failed load rather than a blank page.
 */
export function isRawCreatorInvoices(body: unknown): body is RawCreatorInvoices {
  if (!isRecord(body) || !Array.isArray(body.items)) return false;

  return body.items.every((item) => {
    if (!isRecord(item) || !isRecord(item.contract) || !isRecord(item.components)) return false;
    const { components } = item;
    return (
      typeof item.contract.id === "string" &&
      typeof item.total === "number" &&
      (INVOICE_STATUSES as unknown[]).includes(item.invoiceStatus) &&
      [components.fixedRate, components.additionalContent, components.performanceBonus, components.penalty].every(
        isComponent,
      )
    );
  });
}

/**
 * A proof link is followed by the creator's click, so only https passes: a javascript: or
 * data: link would run in the page, and plain http would send the signed link in the clear
 * (OWASP A03, A02). Anything else keeps the file's name and loses the link.
 */
function safeLink(url: string): string | null {
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function toProof(raw: RawPaymentProof | null | undefined): PaymentProof | null {
  if (!raw) return null;
  return { url: safeLink(raw.url), fileName: raw.fileName, uploadedAt: raw.uploadedAt };
}

function toComment(raw: RawInvoiceComment): InvoiceComment {
  return {
    id: raw.id,
    authorName: raw.authorName,
    authorRole: raw.authorRole,
    text: raw.text,
    createdAt: raw.createdAt,
  };
}

function toCreatorInvoice(raw: RawCreatorInvoice): CreatorInvoice {
  const { fixedRate, additionalContent, performanceBonus, penalty } = raw.components;
  // An answer that predates the payment fields simply has reached none of those steps.
  const timeline = raw.timeline ?? NO_TIMELINE;

  return {
    contractId: raw.contract.id,
    periodNumber: raw.contract.period,
    periodStart: raw.contract.startDate,
    periodEnd: raw.contract.endDate,
    notStarted: raw.contract.status === "upcoming",
    status: raw.invoiceStatus,
    // A fee or penalty waiting for a formula has charged nothing yet.
    fixedAmount: fixedRate.amount ?? 0,
    extraAmount: additionalContent.amount ?? 0,
    // The bonus alone stays null while it waits: "Menunggu data", never a zero.
    bonusAmount: performanceBonus.amount,
    penaltyAmount: penalty.amount ?? 0,
    // Who recorded an adjustment is the admin's business; the creator reads what and why.
    adjustments: (raw.adjustments ?? []).map(({ id, amount, reason, createdAt }) => ({
      id,
      amount,
      reason,
      createdAt,
    })),
    totalAmount: raw.total,
    floored: raw.floored,
    breakdown: toInvoiceBreakdown(raw),
    reachedAt: {
      finalized: timeline.finalizedAt,
      creator_acked: timeline.acknowledgedAt,
      payment_uploaded: timeline.proofUploadedAt,
      paid: timeline.paidAt,
    },
    proof: toProof(raw.proof),
    comments: (raw.comments ?? []).map(toComment),
  };
}

/** The API's answer under the page's names, in the order it came. */
export function toCreatorInvoices(raw: RawCreatorInvoices): CreatorInvoice[] {
  return raw.items.map(toCreatorInvoice);
}
