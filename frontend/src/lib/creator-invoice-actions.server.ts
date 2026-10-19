"use server";

// Server-side only: the three moves a creator makes on their own invoice (PBI-13, subtask 13.3)
// — acknowledge it, confirm the payment arrived, and write in its thread — sent to 13.1/13.2's
// endpoints with the browser's session and nothing else. Each answers in an outcome the page can
// render: a refusal is an answer, not an exception, so a failure never reaches the browser as a
// crash or a stack trace.
//
// A server action is a public POST endpoint: anyone can call it with any value. So every move
// checks the id, the session and the role here before the backend is asked, and the backend
// checks them all again — it alone knows whose invoice this is.

import { backendPost } from "./backend.server";
import { CREATOR_REFUSALS, validateComment } from "./creator-invoice";
import { isUuid } from "./creator-detail";
import { currentRole } from "./session.server";

/** What a creator's move comes to: done, or why it was refused. */
export type CreatorMoveOutcome = { ok: true } | { ok: false; code: string; message: string };

type KnownCode = Exclude<keyof typeof CREATOR_REFUSALS, "GENERIC">;

function refuse(code: string, message: string): CreatorMoveOutcome {
  return { ok: false, code, message };
}

function known(code: KnownCode): CreatorMoveOutcome {
  return refuse(code, CREATOR_REFUSALS[code]);
}

/** The refusal a status means when the backend names no code of its own. */
const BY_STATUS: Partial<Record<number, KnownCode>> = {
  401: "UNAUTHENTICATED",
  403: "FORBIDDEN",
  404: "INVOICE_NOT_FOUND",
};

function isKnown(code: string): code is KnownCode {
  return code !== "GENERIC" && Object.hasOwn(CREATOR_REFUSALS, code);
}

/**
 * A refusal read for the creator. The status decides first for the three that mean the same
 * whatever the body says; then a known code is worded here; then a 4xx's own message, which
 * the backend writes for people. A 5xx, or a body that is not JSON, says only "try again", so
 * nothing of the server's insides reaches the browser (OWASP A10).
 */
async function readRefusal(response: Response): Promise<CreatorMoveOutcome> {
  const byStatus = BY_STATUS[response.status];
  if (byStatus) return known(byStatus);

  const fallback = `HTTP_${response.status}`;
  if (response.status >= 500) return refuse(fallback, CREATOR_REFUSALS.GENERIC);

  let body: Record<string, unknown>;
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    return refuse(fallback, CREATOR_REFUSALS.GENERIC);
  }

  const code = typeof body.code === "string" ? body.code : fallback;
  if (isKnown(code)) return known(code);
  return refuse(code, typeof body.message === "string" ? body.message : CREATOR_REFUSALS.GENERIC);
}

/**
 * The guards every move shares, then the POST. An id that is not a UUID could climb out of
 * /me/invoices/ into another path (OWASP A01, A05); a caller with no session is asked to sign in
 * rather than sent on anonymously (OWASP A07); an admin is refused, since these moves are the
 * creator's own (OWASP A01). Anything that throws on the way becomes a generic answer (OWASP A10).
 */
async function move(contractId: string, action: string, body: unknown = {}): Promise<CreatorMoveOutcome> {
  if (typeof contractId !== "string" || !isUuid(contractId)) return known("INVOICE_NOT_FOUND");

  try {
    const role = await currentRole();
    if (role === null) return known("UNAUTHENTICATED");
    if (role !== "creator") return known("FORBIDDEN");

    const response = await backendPost(`/me/invoices/${contractId}/${action}`, body);
    return response.ok ? { ok: true } : await readRefusal(response);
  } catch {
    return refuse("UNAVAILABLE", CREATOR_REFUSALS.GENERIC);
  }
}

/** Accepts a finalized invoice as it stands; the backend moves it to creator_acked. */
export async function acknowledgeInvoice(contractId: string): Promise<CreatorMoveOutcome> {
  return move(contractId, "acknowledge");
}

/** Confirms the money arrived once the proof is in; the backend marks the invoice paid. */
export async function confirmInvoicePayment(contractId: string): Promise<CreatorMoveOutcome> {
  return move(contractId, "confirm-payment");
}

/**
 * Adds a comment to the invoice's thread, open at every status. The text is checked here in the
 * form's own words and sent trimmed; who wrote it and when stay the server's to record.
 */
export async function addInvoiceComment(contractId: string, text: string): Promise<CreatorMoveOutcome> {
  const problem = validateComment(typeof text === "string" ? text : "");
  if (problem !== null) return refuse("COMMENT_INVALID", problem);

  return move(contractId, "comments", { text: text.trim() });
}
