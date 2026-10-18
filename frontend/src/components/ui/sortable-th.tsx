import type { ReactNode } from "react";

export type SortDirection = "asc" | "desc";

const ARIA_SORT = { asc: "ascending", desc: "descending" } as const;
const ARROWS: Record<SortDirection, string> = { asc: "↑", desc: "↓" };

/**
 * A column header the table can be sorted by. The direction lives with the caller (the URL, on
 * the pages that use it): the cell announces it to screen readers through aria-sort, the arrow
 * and the title say it in words, and one press asks the caller to turn it over. A direction of
 * null is a column the table is not sorted by right now: no arrow, aria-sort "none", and the
 * title says what a press would do.
 *
 * It knows nothing about the column it heads. The label and what "asc" and "desc" mean for
 * this column come in as props, so the Content Plan, Task Saya and Rate & Invoicing share it as
 * it is. `beside` draws something next to the button, outside it, such as an ⓘ, since a button
 * cannot hold another.
 *
 * Open/Closed Principle: sorting another column or another table means passing a different
 * label and hints, never editing this component. Single Responsibility: it draws the header
 * and reports the press; where the direction is kept is the caller's business.
 */
export function SortableTh({
  label,
  direction,
  hints,
  idleHint,
  align = "left",
  beside,
  onToggle,
}: Readonly<{
  label: string;
  direction: SortDirection | null;
  /** What each direction means for this column, such as "Terdekat dulu". */
  hints: Readonly<Record<SortDirection, string>>;
  /** What a press does while the table is not sorted by this column. */
  idleHint?: string;
  /** "right" for a column of numbers. */
  align?: "left" | "right";
  beside?: ReactNode;
  onToggle: () => void;
}>) {
  const right = align === "right";

  return (
    <th
      role="columnheader"
      scope="col"
      aria-sort={direction ? ARIA_SORT[direction] : "none"}
      className={`px-5 py-3 font-semibold ${right ? "text-right" : "text-left"}`}
    >
      <span className={`inline-flex items-center gap-1 ${right ? "justify-end" : ""}`}>
        <button
          type="button"
          onClick={onToggle}
          title={direction ? hints[direction] : (idleHint ?? `Urutkan menurut ${label}`)}
          className="inline-flex cursor-pointer items-center gap-1 rounded-(--radius-control) border-none bg-transparent p-0 text-left font-semibold text-muted hover:text-ink"
        >
          {label}
          {direction ? (
            <span aria-hidden="true" className="text-ink">
              {ARROWS[direction]}
            </span>
          ) : null}
        </button>
        {beside}
      </span>
    </th>
  );
}
