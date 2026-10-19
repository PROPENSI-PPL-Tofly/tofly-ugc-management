"use server";

// Server-side only: the comment thread of one invoice (PBI-13, subtask 13.4), read from and added
// to 13.2's endpoints with the browser's session. A refusal or a failure is an answer, not an
// exception, so the panel says so instead of breaking.

import { backendGet } from "./backend.server";
import { isUuid } from "./creator-detail";
import {
  toInvoiceComments,
  type InvoiceComment,
  type RawInvoiceComment,
} from "./invoice-comments-api";
import { currentRole } from "./session.server";

export const COMMENTS_FORBIDDEN = "Hanya admin yang dapat membuka komentar invoice ini.";
export const COMMENTS_UNAVAILABLE = "Komentar tidak bisa dimuat.";

// What reading the thread comes to: the comments, or the message the panel shows.
export type CommentsOutcome =
  | { ok: true; comments: InvoiceComment[] }
  | { ok: false; message: string };

// The backend's answer, or null when it is not JSON at all.
async function readBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function loadInvoiceComments(contractId: string): Promise<CommentsOutcome> {
  const unavailable: CommentsOutcome = { ok: false, message: COMMENTS_UNAVAILABLE };
  // An id that is not a UUID never goes into the backend path (OWASP A05 Injection, A01 SSRF).
  if (typeof contractId !== "string" || !isUuid(contractId)) return unavailable;
  // Only an admin reads the thread here (OWASP A01 Broken Access Control).
  if ((await currentRole()) !== "admin") return { ok: false, message: COMMENTS_FORBIDDEN };

  // A failure of any kind becomes a message, never a crash or a raw error (OWASP A10).
  let response: Response;
  try {
    response = await backendGet(`/invoices/${contractId}/comments`);
  } catch {
    return unavailable;
  }
  const body = await readBody(response);
  return response.ok && Array.isArray(body)
    ? { ok: true, comments: toInvoiceComments(body as RawInvoiceComment[]) }
    : unavailable;
}
