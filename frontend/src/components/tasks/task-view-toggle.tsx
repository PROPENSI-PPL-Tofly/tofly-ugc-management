import Link from "next/link";
import type { TaskStatusFilter } from "@/lib/my-tasks";
import { TASK_VIEWS, taskViewHref, type TaskView } from "@/lib/task-view";

// A segmented control, as the prototype draws it: two halves in one rounded frame, the view
// being shown filled in.
const FRAME = "inline-flex overflow-hidden rounded-(--radius-control) border border-rule";
const HALF = "px-3 py-1.5 text-[12.5px] font-semibold";
const ON = "bg-ink text-surface";
const OFF = "bg-surface text-ink-2 hover:bg-surface-2";

/**
 * Task Saya's Tabel / Kalender switch (PBI-7, subtask 7.3). Links, not buttons: the view lives
 * in the address like the rest of the page's state, so the calendar can be bookmarked and the
 * browser's Back returns to the table.
 */
export function TaskViewToggle({
  view,
  status,
}: Readonly<{
  /** The view being shown. */
  view: TaskView;
  /** The status filter in effect, carried over to the other view. */
  status: TaskStatusFilter | null;
}>) {
  return (
    <div role="group" aria-label="Tampilan tugas" className={FRAME}>
      {TASK_VIEWS.map(({ key, label }) => (
        <Link
          key={key}
          href={taskViewHref(key, status)}
          aria-current={key === view ? "page" : undefined}
          className={`${HALF} ${key === view ? ON : OFF}`}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
