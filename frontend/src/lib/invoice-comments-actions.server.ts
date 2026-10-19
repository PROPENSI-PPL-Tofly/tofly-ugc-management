"use server";

// Server-side only: the comment thread of one invoice (PBI-13, subtask 13.4), read from and added
// to 13.2's endpoints with the browser's session. A refusal or a failure is an answer, not an
// exception, so the panel says so instead of breaking.

import { backendGet, backendPost } from "./backend.server";
import { isUuid } from "./creator-detail";
import {
  isRawInvoiceComment,
  toInvoiceComment,
  toInvoiceComments,
  type InvoiceComment,
  type RawInvoiceComment,
} from "./invoice-comments-api";
import {
  COMMENT_FAILED,
  COMMENT_FORBIDDEN,
  COMMENTS_FORBIDDEN,
  COMMENTS_UNAVAILABLE,
  commentText,
  validateComment,
} from "./invoice-comments";
import { readBody, refusalText } from "./response-body";
import { currentRole } from "./session.server";


// What adding a comment comes to: the saved comment, or the message the panel shows.
export type CommentOutcome = { ok: true; comment: InvoiceComment } | { ok: false; message: string };

// What reading the thread comes to: the comments, or the message the panel shows.
export type CommentsOutcome =
  | { ok: true; comments: InvoiceComment[] }
  | { ok: false; message: string };

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

export async function addInvoiceComment(contractId: string, text: string): Promise<CommentOutcome> {
  const failed: CommentOutcome = { ok: false, message: COMMENT_FAILED };
  // An id that is not a UUID never goes into the backend path (OWASP A05 Injection, A01 SSRF).
  if (typeof contractId !== "string" || !isUuid(contractId)) return failed;
  // Only an admin adds a comment here (OWASP A01 Broken Access Control).
  if ((await currentRole()) !== "admin") return { ok: false, message: COMMENT_FORBIDDEN };
  // A server action can be called with anything; only text goes on.
  if (typeof text !== "string") return failed;
  // The box's rules again, on the server (OWASP A06:2025 Insecure Design).
  const problem = validateComment(text);
  if (problem) return { ok: false, message: problem };

  // A failure of any kind becomes a message, never a crash or a raw error (OWASP A10).
  let response: Response;
  try {
    response = await backendPost(`/invoices/${contractId}/comments`, { text: commentText(text) });
  } catch {
    return failed;
  }
  const body = await readBody(response);
  if (response.ok) {
    return isRawInvoiceComment(body) ? { ok: true, comment: toInvoiceComment(body) } : failed;
  }
  // A refusal the backend worded for the admin passes on; anything else stays general.
  const message = refusalText(response, body);
  return message === null ? failed : { ok: false, message };
}
