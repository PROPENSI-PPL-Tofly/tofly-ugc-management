// The payment proof's own rules (PBI-13, subtask 13.4): when an admin may upload it, and which
// files the upload takes. Pure module — no next/headers, no fetch — so the rules are tested
// without a DOM. The types and the size are the PRD's proposal for 13.2, named once so a change
// there is made in one place.

import type { InvoiceStatus } from "./invoice";

/** The file types the upload takes: PDF, JPG and PNG. */
export const PROOF_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;

/** The largest file the upload takes: 5 MB. */
export const PROOF_MAX_BYTES = 5 * 1024 * 1024;

export const PROOF_TYPE_INVALID = "File bukti pembayaran harus PDF, JPG, atau PNG.";
export const PROOF_TOO_LARGE = "Ukuran file maksimal 5 MB.";

/** What the rules read from a picked file; the browser's File carries all three. */
export interface ProofFile {
  name: string;
  type: string;
  size: number;
}

/** The proof is uploaded once the creator has acknowledged the invoice, and only then. */
export function canUploadProof(status: InvoiceStatus): boolean {
  return status === "creator_acked";
}

/** What is wrong with a picked file, in the admin's words, or null when the upload takes it. */
export function validateProofFile(file: ProofFile): string | null {
  if (!(PROOF_TYPES as readonly string[]).includes(file.type)) return PROOF_TYPE_INVALID;
  if (file.size > PROOF_MAX_BYTES) return PROOF_TOO_LARGE;
  return null;
}
