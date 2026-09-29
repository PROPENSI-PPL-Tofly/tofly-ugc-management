// Class strings shared by the app's forms. Plain module so any component can use them.

/**
 * Marks a required field's label. Drawn by CSS so the asterisk stays out of the label text and
 * the accessible name; screen readers announce "required" from the control's own attribute.
 */
export const REQUIRED_MARK = "after:ml-0.5 after:text-red-ink after:content-['*']";

/** A text input or textarea; turns red while the control is aria-invalid. */
export const FIELD =
  "rounded-(--radius-control) border border-rule bg-surface px-3 py-2 text-sm text-ink aria-invalid:border-red";

/** The message under a field, tied to it through aria-describedby. */
export const FIELD_ERROR = "text-sm text-red-ink";

/**
 * Props for a whole-number field. A text input with a numeric keyboard rather than
 * type="number": the browser's number field changes its value when the page is scrolled with
 * the mouse over it, and adds spinner arrows nobody uses for a quota or a fee.
 */
export const NUMERIC_INPUT = { type: "text", inputMode: "numeric", pattern: "[0-9]*" } as const;

/** What is left of a typed value once everything but the digits is dropped. */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}
