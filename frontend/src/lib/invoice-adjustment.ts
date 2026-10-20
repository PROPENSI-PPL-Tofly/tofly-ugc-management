// The adjustment form and the finalize dialog's own rules (PBI-12, subtask 12.2): what a manual
// adjustment must say, when one may be added and when an invoice may be frozen, and what the
// backend's refusals mean to the admin reading them. Pure module — no next/headers, no fetch —
// so the forms stay presentational and these rules are tested without a DOM.
//
// The wording of the field errors is the backend's own (checkManualAdjustment, invoice-lifecycle),
// so the form and the server never tell an admin two different things about the same mistake.

import { MAX_FIXED_RATE } from "./creator-form";
import { formatDeduction, formatRupiah } from "./format";
import type { InvoiceStatus } from "./invoice";

/** The reason says why the amount moves; the backend takes at most this many characters. */
export const REASON_MAX_LENGTH = 500;

export const AMOUNT_EMPTY = "Jumlah wajib diisi";
export const AMOUNT_INVALID = "Jumlah harus angka bulat dan bukan nol";
export const AMOUNT_TOO_LARGE = "Jumlah maksimal Rp10.000.000 per penyesuaian";
export const AMOUNT_THOUSANDS = "Tulis nominal tanpa titik pemisah ribuan, mis. 200000";
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

/** A signed whole number of rupiah with no leading zero, as the form types it and the API reads it. */
const AMOUNT = /^-?[1-9]\d*$/;

/** One adjustment moves an invoice by at most this much either way (the fixed-rate cap). */
export const MAX_ADJUSTMENT = MAX_FIXED_RATE;

/** Rupiah as Indonesians write it, a dot between every three digits: 200.000, -1.500.000. */
const THOUSANDS_DOTS = /^-?\d{1,3}(\.\d{3})+$/;

/**
 * Reads one amount line: a non-zero whole number of rupiah within the limit — exactly what
 * checkManualAdjustment takes on the server.
 */
function readAmount(raw: string): number | null {
  const typed = raw.trim();
  if (!AMOUNT.test(typed) || overLimit(typed)) return null;
  return Number(typed);
}

/**
 * Whether a whole amount is past the limit, read from its digits: a number Number() could only
 * round (past 2^53) is never read as a number first, so it can never pass as a smaller one.
 */
function overLimit(typed: string): boolean {
  const digits = typed.replace("-", "");
  const limit = String(MAX_ADJUSTMENT);
  return digits.length > limit.length || (digits.length === limit.length && digits > limit);
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
  } else if (THOUSANDS_DOTS.test(typed)) {
    // The API reads a dot as decimals; say how to write it rather than "two decimals at most".
    errors.amount = AMOUNT_THOUSANDS;
  } else if (!AMOUNT.test(typed)) {
    errors.amount = AMOUNT_INVALID;
  } else if (overLimit(typed)) {
    errors.amount = AMOUNT_TOO_LARGE;
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
 * Freezing needs a contract that has ended and an invoice still running. `lastDay` is the last day
 * the contract counts, which the backend moves to the day access was revoked when it ended early;
 * `today` and `lastDay` are plain calendar days, compared as written.
 */
export function canFinalize(invoiceStatus: InvoiceStatus, today: string, lastDay: string): boolean {
  return invoiceStatus === "accruing" && today > lastDay;
}

/** An adjustment line reads as what was added or taken away: "+Rp200.000" / "− Rp100.000". */
export function adjustmentLabel(amount: number): string {
  // One minus style for every deduction, the way the whole app writes one (formatDeduction).
  return amount < 0 ? formatDeduction(-amount) : `+${formatRupiah(amount)}`;
}

/**
 * What a refusal from POST /invoices/:contractId/… means to the admin. The backend sends its
 * message with the code; when only the code survives a proxy or an old tab, these are the same
 * sentences in the same words.
 */
export const REFUSAL_MESSAGES = {
  INVOICE_FINALIZED: "Invoice sudah difinalisasi",
  CONTRACT_NOT_ENDED: "Kontrak belum berakhir",
  INVOICE_DATA_INCOMPLETE: "Invoice belum bisa difinalisasi: masih ada komponen yang menunggu formula rate.",
  INVOICE_BONUS_PENDING:
    "Bonus performa masih menunggu data. Konfirmasi untuk mengunci bonus yang sudah terukur.",
  CONTRACT_NOT_FOUND: "Invoice tidak ditemukan.",
  INVOICE_NOT_FOUND: "Invoice tidak ditemukan.",
} as const;

/** The admin's words for a refusal code, or null for one this page does not know. */
export function refusalMessage(code: string | undefined): string | null {
  // Own keys only, so a code such as "constructor" never reads an inherited property.
  return code !== undefined && Object.hasOwn(REFUSAL_MESSAGES, code)
    ? REFUSAL_MESSAGES[code as keyof typeof REFUSAL_MESSAGES]
    : null;
}
