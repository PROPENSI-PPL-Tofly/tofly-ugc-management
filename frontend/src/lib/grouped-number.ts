// A number field groups its digits by thousands as they are typed, the way the app writes
// amounts and counts (Rp1.500.000, 12.400 views): a dot every three digits from the right.
// Only text made of digits and dots is regrouped; anything else is left exactly as typed, so the
// field can say what is wrong with it instead of quietly turning it into another number.

const DIGITS_AND_DOTS = /^[\d.]+$/;

/** The typed text as the field shows it: grouped when it is digits (and dots), else as typed. */
export function groupDigits(typed: string): string {
  if (!DIGITS_AND_DOTS.test(typed)) return typed;
  const digits = typed.replaceAll(".", "");
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Digits correctly grouped by thousands, e.g. "1.500.000", read back as the digits alone. */
export function ungroupDigits(shown: string): string {
  return /^\d{1,3}(\.\d{3})+$/.test(shown) ? shown.replaceAll(".", "") : shown;
}

/** How many digits sit before `caret` in `text`, so the caret can keep its place after regrouping. */
export function digitsBefore(text: string, caret: number): number {
  return text.slice(0, caret).replace(/\D/g, "").length;
}

/** Where the caret goes in regrouped `text` to sit after the same `digits` digits. */
export function caretAfterDigits(text: string, digits: number): number {
  if (digits === 0) return 0;
  let seen = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (/\d/.test(text[index])) seen += 1;
    if (seen === digits) return index + 1;
  }
  return text.length;
}
