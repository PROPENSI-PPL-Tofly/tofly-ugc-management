"use server";

// Server-side only: the two moves an admin makes on a running invoice (PBI-12, subtask 12.2):
// add a manual adjustment and freeze the amounts. Both go to 12.1's endpoints with the browser's
// session and nothing else, and both answer in a result the form can render — a refusal is an
// answer, not an exception, so the modal stays honest instead of vanishing on a 409.
//
// The draft is validated here as well as in the form: the server is the authority, and a client
// that skipped the form must hear the same words as one that did not.

import { backendPost } from "./backend.server";
import { isUuid } from "./creator-detail";
import {
  adjustmentAmount,
  adjustmentReason,
  refusalMessage,
  validateAdjustment,
  type AdjustmentDraft,
  type AdjustmentErrors,
} from "./invoice-adjustment";
import { currentRole } from "./session.server";

/** What an invoice move comes to: done, or why it was refused. */
export type ActionOutcome =
  | { ok: true }
  | { ok: false; code: string; message: string; fieldErrors?: AdjustmentErrors };

/** What every failure says when there is no operator-facing message to show. */
const GENERIC_FAILURE = "Permintaan tidak dapat diproses. Coba lagi.";

function refuse(code: string, message: string, fieldErrors?: AdjustmentErrors): ActionOutcome {
  return fieldErrors ? { ok: false, code, message, fieldErrors } : { ok: false, code, message };
}

/** The coded refusals of the invoice lifecycle read for an admin; unknown ones stand as sent. */
function readRefusal(status: number, body: Record<string, unknown>): ActionOutcome {
  const code = typeof body.code === "string" ? body.code : `HTTP_${status}`;
  const said = typeof body.message === "string" ? body.message : "";
  return refuse(code, refusalMessage(code) ?? (said !== "" ? said : GENERIC_FAILURE));
}

async function move(path: string, body?: unknown): Promise<ActionOutcome> {
  const response = await backendPost(path, body);

  if (response.ok) return { ok: true };

  // Only a message written for the operator passes through; anything else is generic (OWASP A05).
  let parsed: Record<string, unknown> = {};
  try {
    parsed = (await response.json()) as Record<string, unknown>;
  } catch {
    return refuse(`HTTP_${response.status}`, GENERIC_FAILURE);
  }

  // A lifecycle refusal can come as a 422 too (INVOICE_DATA_INCOMPLETE, INVOICE_BONUS_PENDING);
  // its code says so, where a field check sends errors instead.
  if (response.status === 422 && typeof parsed.code !== "string") {
    const errors = parsed.errors as AdjustmentErrors | undefined;
    return refuse(
      "INVALID",
      typeof parsed.message === "string" ? parsed.message : GENERIC_FAILURE,
      errors,
    );
  }

  if (response.status >= 400 && response.status < 500) {
    return readRefusal(response.status, parsed);
  }

  return refuse(`HTTP_${response.status}`, GENERIC_FAILURE);
}

/** The path guards every invoice move shares: an id the API would take and an admin asking. */
async function allowed(contractId: string): Promise<ActionOutcome | null> {
  if (typeof contractId !== "string" || !isUuid(contractId)) {
    return refuse("INVOICE_NOT_FOUND", refusalMessage("INVOICE_NOT_FOUND") ?? GENERIC_FAILURE);
  }
  if ((await currentRole()) !== "admin") {
    return refuse("FORBIDDEN", "Hanya admin yang dapat mengubah invoice.");
  }
  return null;
}

/**
 * Adds one manual adjustment to a running invoice. The amount and the reason are checked here
 * first, in the backend's own words, and the actor and the timestamp stay the server's to set.
 */
export async function addInvoiceAdjustment(
  contractId: string,
  draft: AdjustmentDraft,
): Promise<ActionOutcome> {
  const blocked = await allowed(contractId);
  if (blocked) return blocked;

  const fieldErrors = validateAdjustment(draft);
  if (Object.keys(fieldErrors).length > 0) {
    return refuse("INVALID", "Data penyesuaian tidak valid", fieldErrors);
  }

  return move(`/invoices/${contractId}/adjustments`, {
    amount: adjustmentAmount(draft),
    reason: adjustmentReason(draft),
  });
}

/**
 * Freezes a finished invoice: the amounts stop moving with the formula and the content. The
 * server decides whether the contract has really ended and whether anything still waits for
 * data; its refusals come back worded for the admin. `acceptPendingBonus` says the admin was told
 * the bonus still waits for performance data and freezes it at what was measured; only a real
 * `true` says so.
 */
export async function finalizeInvoice(
  contractId: string,
  { acceptPendingBonus }: { acceptPendingBonus?: boolean } = {},
): Promise<ActionOutcome> {
  const blocked = await allowed(contractId);
  if (blocked) return blocked;

  return move(`/invoices/${contractId}/finalize`, {
    acceptPendingBonus: acceptPendingBonus === true,
  });
}
