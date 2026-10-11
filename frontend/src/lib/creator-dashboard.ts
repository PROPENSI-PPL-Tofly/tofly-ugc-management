// The creator dashboard's stat cards (PBI-7, subtask 7.3): one card per status the creator
// still has to act on. The labels are the prototype's; the count behind each card and the
// place it leads to both come from its status.

import { daysUntil, EMPTY } from "./format";
import type { TaskStatusFilter } from "./my-tasks";

const TASKS_PATH = "/creator/tasks";

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

/** Where a card leads: Task Saya, narrowed to the card's status. */
export function statCardHref(status: TaskStatusFilter): string {
  return `${TASKS_PATH}?status=${status}`;
}

/**
 * What the Deadline Terdekat card reads: the days left to the nearest deadline still open, never
 * below zero, and a dash when nothing is open. `now` is passed in so a test can pin the day.
 */
export function nearestDeadlineLabel(deadline: string | null, now: Date): string {
  const days = daysUntil(deadline, now);

  return days === null ? EMPTY : `${Math.max(0, days)} hari lagi`;
}
