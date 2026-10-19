"use server";

// Server-side only: the admin's payment proof upload (PBI-13, subtask 13.4), sent to 13.2's
// endpoint with the browser's session. Every check the form makes is made again here: the server
// is the authority, and a client that skipped the form must hear the same words.

import { backendPostForm } from "./backend.server";
import { isUuid } from "./creator-detail";
import { PROOF_TYPE_INVALID, validateProofFile } from "./invoice-payment";
import { toInvoicePayment, type PaymentProof } from "./invoice-payment-api";
import { currentRole } from "./session.server";

export const UPLOAD_FORBIDDEN = "Hanya admin yang dapat mengunggah bukti pembayaran.";
export const UPLOAD_FAILED = "Bukti pembayaran gagal diunggah. Coba lagi.";
const INVOICE_NOT_FOUND = "Invoice tidak ditemukan.";

// What an upload comes to: the saved proof, or the message the panel shows.
export type UploadOutcome = { ok: true; proof: PaymentProof } | { ok: false; message: string };

// The saved proof as 13.2 answers it.
type SavedProof = { fileName: string; url: string; uploadedAt: string };

function refuse(message: string): UploadOutcome {
  return { ok: false, message };
}

// The backend's answer as an object, or null when it is not JSON at all.
async function readBody(response: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function uploadPaymentProof(
  contractId: string,
  form: FormData,
): Promise<UploadOutcome> {
  // An id that is not a UUID never goes into the backend path (OWASP A05 Injection, A01 SSRF).
  if (typeof contractId !== "string" || !isUuid(contractId)) return refuse(INVOICE_NOT_FOUND);
  // Only an admin uploads a proof (OWASP A01 Broken Access Control).
  if ((await currentRole()) !== "admin") return refuse(UPLOAD_FORBIDDEN);

  // The form's checks again, on the server (OWASP A06 Insecure Design).
  const file = form.get("file");
  if (!(file instanceof File)) return refuse(PROOF_TYPE_INVALID);
  const invalid = validateProofFile(file);
  if (invalid) return refuse(invalid);

  // Only the file goes on; nothing else the form carried reaches the backend.
  const sent = new FormData();
  sent.set("file", file);

  // A failure of any kind becomes a message, never a crash or a raw error (OWASP A10).
  let response: Response;
  try {
    response = await backendPostForm(`/invoices/${contractId}/payment-proof`, sent);
  } catch {
    return refuse(UPLOAD_FAILED);
  }
  const body = await readBody(response);

  if (response.ok) {
    if (typeof body?.fileName !== "string" || typeof body.url !== "string") {
      return refuse(UPLOAD_FAILED);
    }
    const { proof } = toInvoicePayment({ paymentProof: body as SavedProof });
    return { ok: true, proof: proof! };
  }

  // A refusal the backend worded for the admin passes on; anything else stays general.
  if (response.status < 500 && typeof body?.message === "string") return refuse(body.message);
  return refuse(UPLOAD_FAILED);
}
