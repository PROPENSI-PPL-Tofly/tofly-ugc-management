// The creator dashboard's stat cards (PBI-7, subtask 7.3): one card per status the creator
// still has to act on. The labels are the prototype's; the count behind each card and the
// place it leads to both come from its status.

import { shiftDay } from "./deadline-period";
import { daysUntil, EMPTY, formatDaysLeft } from "./format";
import {
  DEFAULT_MY_TASKS_PARAMS,
  TASK_STATUS_FILTERS,
  myTabOf,
  type MyTask,
  type MyTasksParams,
  type TaskStatusFilter,
} from "./my-tasks";
import { taskViewHref } from "./task-view";

/** Everything not finished yet: the statuses a deadline is still open in. */
export const OPEN_STATUSES = TASK_STATUS_FILTERS.filter((status) => status !== "link_submitted");

/** How many rows each deadline list shows; the rest are one link away on Task Saya. */
export const AGENDA_ROWS = 5;

/** How far ahead the dashboard looks for deadlines, today included. */
export const UPCOMING_DAYS = 14;

/** A deadline list's first rows and its size across every page. */
export interface DeadlineList {
  items: MyTask[];
  total: number;
}

/** Unfinished work the API flags overdue, the same flag Task Saya's Overdue filter reads. */
export function overdueParams(): MyTasksParams {
  return { ...DEFAULT_MY_TASKS_PARAMS, status: [...OPEN_STATUSES], overdue: "yes" };
}

/**
 * Unfinished work due from today through UPCOMING_DAYS on. Overdue work is left to its own
 * list, so no task is listed twice.
 */
export function upcomingParams(today: string): MyTasksParams {
  return {
    ...DEFAULT_MY_TASKS_PARAMS,
    status: [...OPEN_STATUSES],
    overdue: "no",
    period: "custom",
    from: today,
    to: shiftDay(today, UPCOMING_DAYS),
  };
}

/** The whole of a deadline list on Task Saya's table, under the very same filters. */
export function deadlineListHref(params: MyTasksParams): string {
  return taskViewHref("table", params);
}

/** One task's detail panel on Task Saya, the link a notification uses. */
export function taskDetailHref(contentId: string): string {
  return `/creator/tasks?${new URLSearchParams({ content: contentId })}`;
}

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
