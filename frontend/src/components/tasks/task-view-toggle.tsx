import Link from "next/link";
import type { MyTasksParams } from "@/lib/my-tasks";
import { TASK_VIEWS, taskViewHref, type TaskView } from "@/lib/task-view";

// A segmented control, as the prototype draws it: two halves in one rounded frame, the view
// being shown filled in brand blue, the colour every current selection in the app takes.
const FRAME = "inline-flex overflow-hidden rounded-(--radius-control) border border-rule";
const HALF = "px-3 py-1.5 text-[12.5px] font-semibold";
const ON = "bg-accent text-accent-ink";
const OFF = "bg-surface text-ink-2 hover:bg-surface-2";

/**
 * Task Saya's Tabel / Kalender switch (PBI-7, subtask 7.3). Links, not buttons: the view lives
 * in the address like the rest of the page's state, so the calendar can be bookmarked and the
 * browser's Back returns to the table.
 */
export function TaskViewToggle({
  view,
  state,
}: Readonly<{
  /** The view being shown. */
  view: TaskView;
  /** The tab, search and filters in effect, carried over to the other view. */
  state: MyTasksParams;
}>) {
  return (
    <div role="group" aria-label="Tampilan tugas" className={FRAME}>
      {TASK_VIEWS.map(({ key, label }) => (
        <Link
          key={key}
          href={taskViewHref(key, state)}
          aria-current={key === view ? "page" : undefined}
          className={`${HALF} ${key === view ? ON : OFF}`}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
