// The translation between the payment part of an invoice and the API that answers it (PBI-13,
// subtask 13.4). The field names are the ones agreed for 13.1 and 13.2; everything that knows
// them lives here (Adapter), so a rename on the backend changes this file only.

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

// The uploaded proof under the page's names: what it is called and where it opens.
export interface PaymentProof {
  fileName: string;
  href: string;
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

// One saved proof under the page's names; the one place the proof's fields are renamed.
export function toPaymentProof(raw: RawPaymentProof): PaymentProof {
  return { fileName: raw.fileName, href: raw.url, uploadedAt: raw.uploadedAt };
}

export function toInvoicePayment(raw: RawInvoicePayment): InvoicePayment {
  return {
    acknowledgedAt: raw.acknowledgedAt ?? null,
    receivedAt: raw.paidAt ?? null,
    proof: raw.paymentProof ? toPaymentProof(raw.paymentProof) : null,
  };
}
