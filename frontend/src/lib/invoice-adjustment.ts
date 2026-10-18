// The adjustment form and the finalize dialog's own rules (PBI-12, subtask 12.2): what a manual
// adjustment must say, when one may be added and when an invoice may be frozen, and what the
// backend's refusals mean to the admin reading them. Pure module — no next/headers, no fetch —
// so the forms stay presentational and these rules are tested without a DOM.
//
// The wording of the field errors is the backend's own (checkManualAdjustment, invoice-lifecycle),
// so the form and the server never tell an admin two different things about the same mistake.

import type { InvoiceStatus } from "./invoice";

/** The reason says why the amount moves; the backend takes at most this many characters. */
export const REASON_MAX_LENGTH = 500;

/** What a frozen invoice is marked with, beside its status. */
export const FINAL_LABEL = "Final";

export const AMOUNT_EMPTY = "Jumlah wajib diisi";
export const AMOUNT_INVALID = "Jumlah harus bukan nol dan maksimal dua angka desimal";
export const REASON_EMPTY = "Alasan wajib diisi";
export const REASON_TOO_LONG = "Alasan maksimal 500 karakter";

export interface AdjustmentDraft {
  /** What was typed, before anything reads it as a number. */
  amount: string;
  reason: string;
}

/** One manual adjustment as the breakdown lists it: what it moved, why, and when. */
export interface AdjustmentLine {
  id: string;
  /** Positive adds to the invoice, negative takes away. */
  amount: number;
  reason: string;
  /** ISO instant the admin added it; the actor stays the server's record. */
  createdAt: string;
}

/** One message per field that needs fixing; a field without one is fine. */
export interface AdjustmentErrors {
  amount?: string;
  reason?: string;
}

/** A signed number with at most two decimals, as the form types it and the API reads it. */
const AMOUNT = /^-?(0|[1-9]\d*)(\.\d{1,2})?$/;

/**
 * Reads one amount line. The whole amount rule in one place: mandatory, a finite non-zero
 * number, at most two decimals — exactly what checkManualAdjustment refuses on the server.
 */
function readAmount(raw: string): number | null {
  const typed = raw.trim();
  if (typed === "") return null;
  if (!AMOUNT.test(typed)) return null;

  const value = Number(typed);
  return Number.isFinite(value) && value !== 0 ? value : null;
}

/**
 * Every field's message at once, so the form can show all of them under their fields rather
 * than one at a time. An empty draft and a wrong draft are said apart: "wajib diisi" for the
 * one the admin left blank, the backend's wording for the one it filled in wrong.
 */
export function validateAdjustment(draft: AdjustmentDraft): AdjustmentErrors {
  const errors: AdjustmentErrors = {};

  const typed = draft.amount.trim();
  if (typed === "") {
    errors.amount = AMOUNT_EMPTY;
  } else if (readAmount(typed) === null) {
    errors.amount = AMOUNT_INVALID;
  }

  // Counted as characters, not UTF-16 units, the way the backend counts a reason.
  const reason = Array.from(draft.reason.trim());
  if (reason.length === 0) {
    errors.reason = REASON_EMPTY;
  } else if (reason.length > REASON_MAX_LENGTH) {
    errors.reason = REASON_TOO_LONG;
  }

  return errors;
}

/** The amount as the API takes it, or null when the draft does not hold one. */
export function adjustmentAmount(draft: AdjustmentDraft): number | null {
  return readAmount(draft.amount);
}

/** The reason as the API takes it: trimmed of what the form should not send. */
export function adjustmentReason(draft: AdjustmentDraft): string {
  return draft.reason.trim();
}

/**
 * A manual adjustment moves an invoice that is still running. A frozen one is settled history;
 * the backend refuses a change and so does the form.
 */
export function canAdjust(invoiceStatus: InvoiceStatus): boolean {
  return invoiceStatus === "accruing";
}

/**
 * Freezing needs a contract that has ended — an early end included, so it is the date and not
 * the calendar status that decides — and an invoice still running. `today` and `endDate` are
 * plain calendar days, compared as written.
 */
export function canFinalize(invoiceStatus: InvoiceStatus, today: string, endDate: string): boolean {
  return invoiceStatus === "accruing" && today > endDate;
}

/** An adjustment line reads as what was added or taken away: "+Rp200.000" / "-Rp100.000". */
export function adjustmentLabel(amount: number): string {
  return `${amount > 0 ? "+" : ""}${formatSigned(amount)}`;
}

function formatSigned(amount: number): string {
  return `${amount < 0 ? "-" : ""}Rp${Math.abs(amount).toLocaleString("id-ID")}`;
}

/**
 * What a refusal from POST /invoices/:contractId/… means to the admin. The backend sends its
 * message with the code; when only the code survives a proxy or an old tab, these are the same
 * sentences in the same words.
 */
export function refusalMessage(code: string | undefined): string | null {
  switch (code) {
    case "INVOICE_FINALIZED":
      return "Invoice sudah difinalisasi";
    case "CONTRACT_NOT_ENDED":
      return "Kontrak belum berakhir";
    case "INVOICE_DATA_INCOMPLETE":
      return "Invoice belum bisa difinalisasi: masih ada data yang menunggu, seperti bonus performa.";
    case "CONTRACT_NOT_FOUND":
    case "INVOICE_NOT_FOUND":
      return "Invoice tidak ditemukan.";
    default:
      return null;
  }
}
