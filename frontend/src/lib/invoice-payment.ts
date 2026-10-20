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

// What the upload answers when it is refused or fails. Kept here, not in the server action's
// file: a "use server" file may export async functions only.
export const UPLOAD_FORBIDDEN = "Hanya admin yang dapat mengunggah bukti pembayaran.";
export const UPLOAD_FAILED = "Bukti pembayaran gagal diunggah. Coba lagi.";

/** What the rules read from a picked file; the browser's File carries all three. */
export interface ProofFile {
  name: string;
  type: string;
  size: number;
}

// The bytes each accepted type starts with, named once beside the types themselves.
const PROOF_SIGNATURES: Record<(typeof PROOF_TYPES)[number], readonly number[]> = {
  "application/pdf": [0x25, 0x50, 0x44, 0x46], // %PDF
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  "image/jpeg": [0xff, 0xd8, 0xff],
};

// Whether a file starts the way its type does. The browser names a file's type from its
// extension, so only its first bytes say what it really is.
export function matchesProofSignature(type: string, head: Uint8Array): boolean {
  const signature = PROOF_SIGNATURES[type as keyof typeof PROOF_SIGNATURES];
  return signature !== undefined && signature.every((byte, index) => head[index] === byte);
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
