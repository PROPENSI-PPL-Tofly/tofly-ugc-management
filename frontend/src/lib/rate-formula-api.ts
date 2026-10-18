// The ways of asking the backend for the rate formula (PBI-8). Browser-side, through the
// same-origin /api proxy like createCreator, so the backend address stays out of the browser.

import { apiFetch } from "./api-client";
import {
  BONUS_PLATFORMS,
  platformErrorKey,
  type RateFormulaErrors,
  type RateFormulaRequest,
  type RateFormulaView,
} from "./rate-formula";

const FORMULA_URL = "/api/rate-formula";

export type SaveRateFormulaResult =
  | { ok: true; formula: RateFormulaView }
  | { ok: false; message: string; errors: RateFormulaErrors };

/** The saved formula. Any failure throws, so the caller can offer to try again. */
export async function fetchRateFormula(): Promise<RateFormulaView> {
  const response = await apiFetch(FORMULA_URL, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Loading the rate formula failed with HTTP ${response.status}`);
  }

  return (await response.json()) as RateFormulaView;
}

const AMOUNT_FIELDS = ["latePenaltyPerDay", "maxPenaltyDays", "specificBonus"] as const;

/**
 * The server's per-field messages, narrowed to text and keyed the way the modal shows them: a
 * platform's metric and tier messages both land under its tier rows.
 */
function formulaErrors(body: unknown): RateFormulaErrors {
  const raw = (body as { errors?: Record<string, unknown> } | null)?.errors ?? {};
  const errors: RateFormulaErrors = {};

  for (const field of AMOUNT_FIELDS) {
    if (typeof raw[field] === "string") errors[field] = raw[field];
  }
  for (const platform of BONUS_PLATFORMS) {
    const key = platformErrorKey(platform);
    const message = [raw[`${key}.tiers`], raw[`${key}.metric`], raw[key]].find(
      (candidate) => typeof candidate === "string",
    );
    if (message !== undefined) errors[key] = message as string;
  }
  return errors;
}

/**
 * Replaces the whole formula. A 422 comes back as the server's message per field so the modal can
 * show each under its input; any other failure, the network included, is one retryable message.
 */
export async function saveRateFormula(request: RateFormulaRequest): Promise<SaveRateFormulaResult> {
  const saveFailed: SaveRateFormulaResult = {
    ok: false,
    message: "Formula rate gagal disimpan. Coba lagi.",
    errors: {},
  };

  let response: Response;
  try {
    response = await apiFetch(FORMULA_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch {
    return saveFailed;
  }

  if (response.ok) {
    return { ok: true, formula: (await response.json()) as RateFormulaView };
  }
  if (response.status !== 422) {
    return saveFailed;
  }

  const body: unknown = await response.json().catch(() => null);
  return { ok: false, message: "Formula rate tidak valid", errors: formulaErrors(body) };
}
