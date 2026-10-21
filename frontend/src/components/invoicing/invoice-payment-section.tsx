"use client";

import { useState } from "react";
import type { InvoiceStatus } from "@/lib/invoice";
import type { PaymentProof } from "@/lib/invoice-payment-api";
import { PaymentProofUpload, type ProofUploader } from "./payment-proof-upload";
import { ProofLink } from "./proof-link";

// The payment proof's place in the Rincian panel (PBI-13, subtask 13.4): the upload while the
// creator has acknowledged, then, once it is sent, the file it sent. Where the payment stands
// is the tracker's to say, and the thread is the Aktivitas & Komentar tab's.
export function InvoicePaymentSection({
  contractId,
  status,
  upload,
  onUploaded,
}: Readonly<{
  contractId: string;
  status: InvoiceStatus;
  // The real upload unless a caller hands in another, as a test does.
  upload?: ProofUploader;
  // The proof was saved; the invoice reads again.
  onUploaded: () => void;
}>) {
  // The proof saved in this panel. The row the panel opened with predates it until the table has
  // read again, and once a proof is in no second upload is offered (PRD 13.2: one per invoice).
  const [uploaded, setUploaded] = useState<PaymentProof | null>(null);

  if (uploaded) {
    return (
      <p role="status" className="text-[13px]">
        Bukti bayar terkirim: <ProofLink proof={uploaded} />
      </p>
    );
  }

  return (
    <PaymentProofUpload
      contractId={contractId}
      status={status}
      upload={upload}
      onUploaded={(proof) => {
        setUploaded(proof);
        onUploaded();
      }}
    />
  );
}
