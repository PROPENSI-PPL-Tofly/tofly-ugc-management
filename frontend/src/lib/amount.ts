// How the app's rupiah number fields are read and checked. Shared by every form that takes an
// amount (the contract's fixed rate, the Atur Formula Rate modal), so they cannot disagree on
// what a valid number is.

/** A number field takes at most this many digits. */
export const MAX_AMOUNT_DIGITS = 10;

/**
 * What a typed value means. Empty is null rather than 0, so a required field can tell "not
 * filled in" from "filled in with 0". Digits are their number, however many there are, so a
 * number past MAX_AMOUNT_DIGITS is refused by amountProblem rather than cut. Anything else (a
 * sign, a separator, a letter) is NaN: dropping it would read "1.500,00" as 150000.
 */
export function parseAmount(raw: string): number | null {
  const typed = raw.trim();
  if (typed === "") return null;
  return /^\d+$/.test(typed) ? Number(typed) : Number.NaN;
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
