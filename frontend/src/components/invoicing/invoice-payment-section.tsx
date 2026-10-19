"use client";

import type { InvoiceStatus } from "@/lib/invoice";
import { toInvoicePayment, type InvoicePayment } from "@/lib/invoice-payment-api";
import { InvoiceComments, type CommentsGateway } from "./invoice-comments";
import { PaymentProofUpload, type ProofUploader } from "./payment-proof-upload";
import { PaymentStatus } from "./payment-status";

// An invoice the API has not sent a payment for yet: no step taken.
const NO_PAYMENT: InvoicePayment = toInvoicePayment({});

// The payment part of one invoice in the Rincian panel (PBI-13, subtask 13.4): where the payment
// stands, the proof upload while the creator has acknowledged, and the comment thread at every
// status. A Paid invoice keeps only the thread to write in.
export function InvoicePaymentSection({
  contractId,
  status,
  payment = NO_PAYMENT,
  upload,
  comments,
  onUploaded,
}: Readonly<{
  contractId: string;
  status: InvoiceStatus;
  // Absent until the API sends one; every step then reads as not taken.
  payment?: InvoicePayment;
  // The real upload and thread unless a caller hands in others, as a test does.
  upload?: ProofUploader;
  comments?: CommentsGateway;
  // The proof was saved; the invoice reads again.
  onUploaded: () => void;
}>) {
  return (
    <div className="flex flex-col gap-5 border-t border-rule pt-4">
      <PaymentStatus payment={payment} />
      <PaymentProofUpload
        contractId={contractId}
        status={status}
        upload={upload}
        onUploaded={onUploaded}
      />
      <InvoiceComments contractId={contractId} comments={comments} />
    </div>
  );
}
