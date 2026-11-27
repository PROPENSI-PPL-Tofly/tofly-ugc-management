// "Ajukan Konten" (PBI-14, 14.2): sends a proposal to 14.1's POST /me/contents/proposals through
// this app's same-origin /api proxy, so the session cookie goes along and the backend's address
// never reaches the browser. Until 14.1 is merged its contract is assumed here (see the PR).

import { apiFetch } from "./api-client";
import { toProposalBody, type ProposalErrors, type ProposalFields } from "./creator-proposal";

/** Sent, or why not: a message for the form's top, and messages under their own fields. */
export type SubmitProposalResult = { ok: true } | { ok: false; message: string; errors: ProposalErrors };

const FAILED = "Pengajuan gagal dikirim. Coba lagi.";
const NOT_ACTIVE = "Pengajuan hanya bisa dikirim selama kontrakmu aktif.";

const FIELDS: readonly (keyof ProposalFields)[] = ["name", "brief", "deadline", "notes"];

/** The 422's messages for the form's own fields; anything else in the body is left out. */
function fieldErrors(body: unknown): ProposalErrors {
  const errors: ProposalErrors = {};
  if (typeof body !== "object" || body === null) return errors;
  const raw = (body as { errors?: unknown }).errors;
  if (typeof raw !== "object" || raw === null) return errors;

  for (const field of FIELDS) {
    const message = (raw as Record<string, unknown>)[field];
    if (typeof message === "string") errors[field] = message;
  }
  return errors;
}

function failed(message: string): SubmitProposalResult {
  return { ok: false, message, errors: {} };
}

/**
 * Proposes a Specific content idea for the creator the session belongs to; the request names
 * nobody, so it cannot propose for another creator (OWASP A01). A 401 never returns: apiFetch
 * sends the browser to the login page.
 */
export async function submitProposal(fields: ProposalFields): Promise<SubmitProposalResult> {
  let response: Response;
  try {
    response = await apiFetch("/api/me/contents/proposals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toProposalBody(fields)),
    });
  } catch {
    return failed(FAILED);
  }

  if (response.ok) return { ok: true };

  // AC 3: the API is the last word on who may propose; its own words never reach the creator.
  if (response.status === 403) return failed(NOT_ACTIVE);

  if (response.status === 422) {
    const errors = fieldErrors(await response.json().catch(() => null));
    return Object.keys(errors).length > 0 ? { ok: false, message: "", errors } : failed(FAILED);
  }

  return failed(FAILED);
}
