// "Unduh Invoice" and "Unduh Receipt" from the browser (PBI-31, 31.3): which documents an invoice
// has, and fetching one through the same-origin /api proxy into a file the browser saves. The
// backend's 31.2 routes decide; the admin's read any invoice, the creator's only their own.

import { apiFetch } from "./api-client";
import { isUuid } from "./creator-detail";
import type { InvoiceStatus } from "./invoice";

export type PdfAudience = "admin" | "creator";

/** The invoice once the creator acknowledged it; the receipt once the payment is confirmed. */
export type PdfDocument = "invoice" | "receipt";

export type DownloadPdfResult = { ok: true; fileName: string } | { ok: false; message: string };

const FAILED = "PDF gagal dibuat. Coba lagi.";
const FORBIDDEN = "Kamu tidak punya akses ke invoice ini.";

/**
 * The documents an invoice offers, agreed 25 Nov 2026: the invoice once the creator acknowledged
 * it, when no adjustment can change it any more; the receipt as well once it is paid.
 */
export function pdfDocumentsFor(status: InvoiceStatus): PdfDocument[] {
  if (status === "paid") return ["invoice", "receipt"];
  if (status === "creator_acked" || status === "payment_uploaded") return ["invoice"];
  return [];
}

/**
 * The file name from the backend's Content-Disposition (RFC 5987), or `fallback` when it has
 * none that reads. Only the last part of a name is kept, so it never names a path.
 */
export function pdfFileName(disposition: string | null, fallback: string): string {
  const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (!encoded) return fallback;
  try {
    const name = decodeURIComponent(encoded).split(/[/\\]/).pop();
    return name ? name : fallback;
  } catch {
    return fallback;
  }
}

function pathOf(contractId: string, audience: PdfAudience, document: PdfDocument): string {
  const base = audience === "admin" ? `/api/invoices/${contractId}` : `/api/me/invoices/${contractId}`;
  return `${base}/${document}-pdf`;
}

/** Hands the bytes to the browser as a download under `fileName`, then lets the object URL go. */
function save(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Fetches one of the invoice's documents and saves it; what went wrong comes back as the line to show (AC 5). */
export async function downloadInvoicePdf(
  contractId: string,
  audience: PdfAudience,
  document: PdfDocument,
): Promise<DownloadPdfResult> {
  if (!isUuid(contractId)) return { ok: false, message: FAILED };

  let response: Response;
  try {
    response = await apiFetch(pathOf(contractId, audience, document), { method: "GET" });
  } catch {
    return { ok: false, message: FAILED };
  }

  if (response.status === 403) return { ok: false, message: FORBIDDEN };
  if (!response.ok || !response.headers.get("content-type")?.startsWith("application/pdf")) {
    return { ok: false, message: FAILED };
  }

  try {
    const fileName = pdfFileName(
      response.headers.get("content-disposition"),
      document === "invoice" ? "Invoice.pdf" : "Receipt.pdf",
    );
    save(await response.blob(), fileName);
    return { ok: true, fileName };
  } catch {
    return { ok: false, message: FAILED };
  }
}
