// How the app's rupiah number fields are read and checked. Shared by every form that takes an
// amount (the contract's fixed rate, the Atur Formula Rate modal), so they cannot disagree on
// what a valid number is.

import { digitsOnly } from "@/components/ui/form-classes";

/** A number field takes at most this many digits. */
export const MAX_AMOUNT_DIGITS = 10;

/**
 * What a typed value means: its digits, capped at MAX_AMOUNT_DIGITS, as a whole number. Empty is
 * null rather than 0, so a required field can tell "not filled in" from "filled in with 0".
 */
export function parseAmount(raw: string): number | null {
  const digits = digitsOnly(raw).slice(0, MAX_AMOUNT_DIGITS);
  return digits === "" ? null : Number(digits);
}

/** A held amount as the input shows it: empty when there is none, so typing "5" gives "5". */
export function amountText(value: number | null): string {
  return value === null ? "" : String(value);
}

/**
 * What is wrong with a number field, or undefined when it is fine: it must be filled in, a
 * whole number from 0 up, of at most MAX_AMOUNT_DIGITS digits. `label` starts the message.
 */
export function amountProblem(value: number | null, label: string): string | undefined {
  if (value === null) return `${label} wajib diisi`;
  if (!Number.isInteger(value)) return `${label} harus berupa angka bulat`;
  if (value < 0) return `${label} minimal 0`;
  if (String(value).length > MAX_AMOUNT_DIGITS) {
    return `${label} maksimal ${MAX_AMOUNT_DIGITS} digit`;
  }
  return undefined;
}
