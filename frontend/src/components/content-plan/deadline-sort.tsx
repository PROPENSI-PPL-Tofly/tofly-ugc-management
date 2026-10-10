import { SortableTh } from "@/components/ui/sortable-th";
import type { DeadlineSort } from "@/lib/content-plan";

/** What each direction means for a deadline. */
const DEADLINE_HINTS = { asc: "Terdekat dulu", desc: "Terjauh dulu" } as const;

/**
 * The deadline column's header: the shared sortable header, worded for deadlines. The sort
 * state, the arrow and the press all come from SortableTh, so this column and any other table
 * that sorts (Task Saya next) behave the same.
 */
export function DeadlineSortTh({
  sort,
  onToggle,
}: Readonly<{ sort: DeadlineSort; onToggle: () => void }>) {
  return <SortableTh label="Deadline" direction={sort} hints={DEADLINE_HINTS} onToggle={onToggle} />;
}
