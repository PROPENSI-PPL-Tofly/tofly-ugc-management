import { Button } from "@/components/ui/button";
import { SortableTh } from "@/components/ui/sortable-th";
import type { DeadlineSort } from "@/lib/content-plan";

/** What each direction means for a deadline. */
const DEADLINE_HINTS = { asc: "Terdekat dulu", desc: "Terjauh dulu" } as const;

/**
 * The deadline column's header: the shared sortable header, worded for deadlines. The sort
 * state, the arrow and the press all come from SortableTh, so this column and any other table
 * that sorts (Task Saya next) behave the same.
 *
 * DRY through composition: this used to draw its own header, arrow and aria-sort. It is now
 * only the deadline's wording around SortableTh, with its name and props kept, so the pages
 * that already used it did not change. `stacked` is SortableTh's: the table turns into cards
 * below lg, where DeadlineSortButton takes the press.
 */
export function DeadlineSortTh({
  sort,
  onToggle,
  stacked = false,
}: Readonly<{ sort: DeadlineSort; onToggle: () => void; stacked?: boolean }>) {
  return (
    <SortableTh
      label="Deadline"
      direction={sort}
      hints={DEADLINE_HINTS}
      stacked={stacked}
      onToggle={onToggle}
    />
  );
}

/**
 * The deadline sort for a list shown as cards below lg, where the header row is hidden: the
 * direction in words and an arrow, one press to turn it over. Gone from lg up, where the
 * header's own button is back.
 */
export function DeadlineSortButton({
  sort,
  onToggle,
}: Readonly<{ sort: DeadlineSort; onToggle: () => void }>) {
  return (
    <div className="flex justify-end px-5 pt-3 lg:hidden">
      <Button
        variant="ghost"
        className="inline-flex items-center gap-1.5"
        aria-label={`Urutkan deadline: ${DEADLINE_HINTS[sort].toLowerCase()}`}
        onClick={onToggle}
      >
        <span className="text-muted">Deadline</span>
        <span>{DEADLINE_HINTS[sort]}</span>
        <span aria-hidden="true">{sort === "asc" ? "↑" : "↓"}</span>
      </Button>
    </div>
  );
}
