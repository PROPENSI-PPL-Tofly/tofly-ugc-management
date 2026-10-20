// The translation between the payment part of an invoice and the API that answers it (PBI-13,
// subtask 13.4). The field names are the ones agreed for 13.1 and 13.2; everything that knows
// them lives here (Adapter), so a rename on the backend changes this file only.

import { safeHref } from "./safe-href";

// One saved payment proof as the API answers it, in the invoice and after an upload.
export interface RawPaymentProof {
  fileName: string;
  url: string;
  uploadedAt: string;
}

// The payment fields of one invoice as the API answers them. Each is optional: an answer from
// before 13.1 and 13.2 carries none of them.
export interface RawInvoicePayment {
  // When the creator acknowledged the invoice, an ISO instant.
  acknowledgedAt?: string | null;
  // When the creator confirmed receipt, an ISO instant.
  paidAt?: string | null;
  paymentProof?: RawPaymentProof | null;
}

// The uploaded proof under the page's names: what it is called and where it opens, or null when
// the link it came with is not one the page may offer.
export interface PaymentProof {
  fileName: string;
  href: string | null;
  uploadedAt: string;
}

// The payment part of an invoice as the Rincian panel reads it.
export interface InvoicePayment {
  acknowledgedAt: string | null;
  receivedAt: string | null;
  proof: PaymentProof | null;
}

// Whether an answer is a saved proof: a name and a link, as 13.2 answers an upload.
export function isRawPaymentProof(body: unknown): body is RawPaymentProof {
  const proof = body as Partial<RawPaymentProof> | null;
  return typeof proof?.fileName === "string" && typeof proof.url === "string";
}

// A proof link the page may offer: an http(s) address, or a path on this site that the /api
// proxy serves with the session. Anything else (javascript:, data:, //another.host) could run or
// leave the site on a click, so it is not offered (OWASP A05:2025 Injection).
function proofHref(url: string): string | null {
  const onThisSite = url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\");
  return onThisSite ? url : safeHref(url);
}

// One saved proof under the page's names; the one place the proof's fields are renamed.
export function toPaymentProof(raw: RawPaymentProof): PaymentProof {
  return { fileName: raw.fileName, href: proofHref(raw.url), uploadedAt: raw.uploadedAt };
}

// The payment as a part of an invoice row: present once the answer sends any payment field, and
// left out before 13.1 and 13.2, so a row from today's API reads exactly as it did.
export function paymentOf(raw: RawInvoicePayment): { payment?: InvoicePayment } {
  const sent =
    raw.acknowledgedAt !== undefined || raw.paidAt !== undefined || raw.paymentProof !== undefined;
  return sent ? { payment: toInvoicePayment(raw) } : {};
}

export function toInvoicePayment(raw: RawInvoicePayment): InvoicePayment {
  return {
    acknowledgedAt: raw.acknowledgedAt ?? null,
    receivedAt: raw.paidAt ?? null,
    proof: raw.paymentProof ? toPaymentProof(raw.paymentProof) : null,
  };
}
