// The creator dashboard's stat cards (PBI-7, subtask 7.3): one card per status the creator
// still has to act on. The labels are the prototype's; the count behind each card and the
// place it leads to both come from its status.

import { daysUntil, EMPTY, formatDaysLeft } from "./format";
import { DEFAULT_MY_TASKS_PARAMS, myTabOf, type TaskStatusFilter } from "./my-tasks";
import { taskViewHref } from "./task-view";

export interface StatCard {
  /** The status whose tasks the card counts, and the one Task Saya opens on when it is clicked. */
  status: TaskStatusFilter;
  label: string;
}

export const STAT_CARDS: readonly StatCard[] = [
  { status: "scheduled", label: "Draft Perlu Disubmit" },
  { status: "draft_revision", label: "Draft Perlu Direvisi" },
  { status: "draft_approved", label: "Link Konten Perlu Diupload" },
];

/**
 * Where a card leads: Task Saya's table on the tab that holds the card's status, narrowed to
 * that status. The address is built by the one module that owns Task Saya's addresses, so a
 * change to them is made in one place.
 */
export function statCardHref(status: TaskStatusFilter): string {
  return taskViewHref("table", {
    ...DEFAULT_MY_TASKS_PARAMS,
    tab: myTabOf(status),
    status: [status],
  });
}

/**
 * What the Deadline Terdekat card reads: the days left to the nearest deadline still open, how
 * late it is once it has passed ("Lewat 2 hari", worded as the detail panel does), and a dash
 * when nothing is open. A passed deadline never reads as time left. `now` is passed in so a test
 * can pin the day.
 */
export function nearestDeadlineLabel(deadline: string | null, now: Date): string {
  const days = daysUntil(deadline, now);

  if (days === null) return EMPTY;

  return days < 0 ? formatDaysLeft(days) : `${days} hari lagi`;
}
