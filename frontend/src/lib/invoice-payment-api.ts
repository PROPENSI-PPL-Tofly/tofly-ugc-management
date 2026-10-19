// The translation between the payment part of an invoice and the API that answers it (PBI-13,
// subtask 13.4). The field names are the ones agreed for 13.1 and 13.2; everything that knows
// them lives here (Adapter), so a rename on the backend changes this file only.

// The payment fields of one invoice as the API answers them. Each is optional: an answer from
// before 13.1 and 13.2 carries none of them.
export interface RawInvoicePayment {
  // When the creator acknowledged the invoice, an ISO instant.
  acknowledgedAt?: string | null;
  // When the creator confirmed receipt, an ISO instant.
  paidAt?: string | null;
  paymentProof?: { fileName: string; url: string; uploadedAt: string } | null;
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

export function toInvoicePayment(raw: RawInvoicePayment): InvoicePayment {
  const proof = raw.paymentProof ?? null;

  return {
    acknowledgedAt: raw.acknowledgedAt ?? null,
    receivedAt: raw.paidAt ?? null,
    proof: proof && { fileName: proof.fileName, href: proof.url, uploadedAt: proof.uploadedAt },
  };
}
