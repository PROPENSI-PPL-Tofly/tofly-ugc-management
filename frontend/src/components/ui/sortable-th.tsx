export type SortDirection = "asc" | "desc";

const ARIA_SORT = { asc: "ascending", desc: "descending" } as const;
const ARROWS: Record<SortDirection, string> = { asc: "↑", desc: "↓" };

/**
 * A column header the table can be sorted by. The direction lives with the caller (the URL, on
 * the pages that use it): the cell announces it to screen readers through aria-sort, the arrow
 * and the title say it in words, and one press asks the caller to turn it over.
 *
 * It knows nothing about the column it heads. The label and what "asc" and "desc" mean for
 * this column come in as props, so the Content Plan and Task Saya share it as it is.
 */
export function SortableTh({
  label,
  direction,
  hints,
  onToggle,
}: Readonly<{
  label: string;
  direction: SortDirection;
  /** What each direction means for this column, such as "Terdekat dulu". */
  hints: Readonly<Record<SortDirection, string>>;
  onToggle: () => void;
}>) {
  return (
    <th aria-sort={ARIA_SORT[direction]} className="px-5 py-3 text-left font-semibold">
      <button
        type="button"
        onClick={onToggle}
        title={hints[direction]}
        className="inline-flex cursor-pointer items-center gap-1 rounded-(--radius-control) border-none bg-transparent p-0 text-left text-xs font-semibold text-muted hover:text-ink"
      >
        {label}
        <span aria-hidden="true" className="text-ink">
          {ARROWS[direction]}
        </span>
      </button>
    </th>
  );
}
