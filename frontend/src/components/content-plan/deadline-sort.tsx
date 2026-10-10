import type { DeadlineSort } from "@/lib/content-plan";

/**
 * The deadline column's header: the sort state lives on the cell for screen readers, the
 * arrow and the title say it in words too, and one press turns the direction over.
 */
export function DeadlineSortTh({
  sort,
  onToggle,
}: Readonly<{ sort: DeadlineSort; onToggle: () => void }>) {
  return (
    <th
      aria-sort={sort === "asc" ? "ascending" : "descending"}
      className="px-5 py-3 text-left font-semibold"
    >
      <button
        type="button"
        onClick={onToggle}
        title={sort === "asc" ? "Terdekat dulu" : "Terjauh dulu"}
        className="cursor-pointer rounded-(--radius-control) border-none bg-transparent p-0 text-left text-xs font-semibold text-muted hover:text-ink"
      >
        Deadline <span aria-hidden="true">{sort === "asc" ? "↑" : "↓"}</span>
      </button>
    </th>
  );
}
