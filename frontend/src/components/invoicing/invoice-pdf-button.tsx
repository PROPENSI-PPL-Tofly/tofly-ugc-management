"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { InvoiceStatus } from "@/lib/invoice";
import { downloadInvoicePdf, pdfDocumentsFor, type PdfAudience, type PdfDocument } from "@/lib/invoice-pdf";

const LABELS: Record<PdfDocument, string> = {
  invoice: "Unduh Invoice",
  receipt: "Unduh Receipt",
};

/** One document's button: busy while the file is made, the reason beside it when it fails (AC 5). */
function DocumentButton({
  contractId,
  audience,
  document,
  className,
  onSaved,
}: Readonly<{
  contractId: string;
  audience: PdfAudience;
  document: PdfDocument;
  className?: string;
  onSaved: (fileName: string) => void;
}>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    const result = await downloadInvoicePdf(contractId, audience, document);
    setBusy(false);
    if (result.ok) onSaved(result.fileName);
    else setError(result.message);
  }

  return (
    <span className="inline-flex flex-col items-end gap-1 max-lg:items-stretch">
      <Button onClick={download} disabled={busy} className={className}>
        {busy ? "Membuat PDF…" : LABELS[document]}
      </Button>
      {error === null ? null : (
        <span role="alert" className="text-xs text-red-ink">
          {error}
        </span>
      )}
    </span>
  );
}

/**
 * "Unduh Invoice" and "Unduh Receipt" (PBI-31, 31.3), wherever an invoice is shown: the invoice
 * once the creator acknowledged it, the receipt once it is paid, nothing before. A toast names
 * the file once it is saved.
 */
export function InvoiceDocumentButtons({
  contractId,
  audience,
  status,
  className,
}: Readonly<{
  contractId: string;
  audience: PdfAudience;
  status: InvoiceStatus;
  className?: string;
}>) {
  const { show, toast } = useToast();
  const documents = pdfDocumentsFor(status);
  if (documents.length === 0) return null;

  return (
    <>
      {documents.map((document) => (
        <DocumentButton
          key={document}
          contractId={contractId}
          audience={audience}
          document={document}
          className={className}
          onSaved={(fileName) => show(`${fileName} diunduh.`)}
        />
      ))}
      {toast}
    </>
  );
}
