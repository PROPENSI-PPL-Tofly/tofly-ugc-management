// The Task Saya calendar (PBI-7, subtask 7.3): which colour group a task falls in. The groups
// and their order are the prototype's legend: whose move it is, with overdue above everything.

import type { Tone } from "@/components/ui/pill";
import type { ContentStatus, ContentTag } from "./creators";

export type CalendarGroup = "todo" | "wait" | "done" | "overdue";

export interface CalendarGroupDef {
  key: CalendarGroup;
  /** How the group reads in the legend. */
  label: string;
  /** The colour of the group's chips and its legend swatch. */
  tone: Tone;
}

/** In the legend's order. */
export const CALENDAR_GROUPS: readonly CalendarGroupDef[] = [
  { key: "todo", label: "Perlu Dikerjakan", tone: "amber" },
  { key: "wait", label: "Menunggu Admin", tone: "neutral" },
  { key: "done", label: "Selesai", tone: "green" },
  { key: "overdue", label: "Overdue", tone: "red" },
];

// Whose move each status is. One entry per status, so a status added to the lifecycle fails to
// compile here until it is given a group.
const STATUS_GROUP: Record<ContentStatus, Exclude<CalendarGroup, "overdue">> = {
  pending: "wait",
  scheduled: "todo",
  draft_review: "wait",
  draft_revision: "todo",
  draft_approved: "todo",
  link_submitted: "done",
};

/** A task past its deadline with no link is overdue first; otherwise it follows its status. */
export function calendarGroup(task: {
  status: ContentStatus;
  tags: readonly ContentTag[];
}): CalendarGroup {
  return task.tags.includes("overdue") ? "overdue" : STATUS_GROUP[task.status];
}
