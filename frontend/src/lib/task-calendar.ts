// The Task Saya calendar (PBI-7, subtask 7.3): which colour group a task falls in. The groups
// and their order are the prototype's legend: whose move it is, with overdue above everything.

import type { Tone } from "@/components/ui/pill";
import type { ContentType } from "./contents";
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

// "Evg_10_RanggaPratama_07112026": the number between the prefix and the creator's name.
const EVERGREEN_NAME = /^Evg_(\d+)_/;

/**
 * What a task's chip reads in a day cell, which is too narrow for a full Evergreen name: its
 * number for an Evergreen content named the generated way, the name itself otherwise, and a
 * mark in front when the task is overdue.
 */
export function calendarChipLabel(task: {
  name: string;
  type: ContentType;
  status: ContentStatus;
  tags: readonly ContentTag[];
}): string {
  const sequence = task.type === "evergreen" ? EVERGREEN_NAME.exec(task.name)?.[1] : undefined;
  const label = sequence ? `Evergreen #${sequence}` : task.name;

  return calendarGroup(task) === "overdue" ? `! ${label}` : label;
}

/** The grid's header, Sunday first as the prototype draws it. */
export const WEEKDAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"] as const;

const DAYS_PER_WEEK = WEEKDAYS.length;

/** A month of a year; `month` counts from 1. */
export interface CalendarMonth {
  year: number;
  month: number;
}

/** One day of the grid and the tasks due on it. */
export interface CalendarCell<Task> {
  /** Plain calendar day, "YYYY-MM-DD". */
  day: string;
  /** The day of the month, from 1. */
  date: number;
  isToday: boolean;
  tasks: Task[];
}

// "Oktober 2026". Formatted in UTC because the month is built in UTC, so no timezone can turn
// the 1st into the last day of the month before.
const MONTH_LABEL = new Intl.DateTimeFormat("id-ID", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * A month as whole weeks: null for the cells before the 1st and after the last day, and for
 * each day the tasks whose deadline is that day, in the order given. `today` is passed in, so
 * the grid never reads the clock and a test can pin the day.
 */
export function monthGrid<Task extends { deadline: string }>(
  { year, month }: CalendarMonth,
  tasks: readonly Task[],
  today: string,
): (CalendarCell<Task> | null)[] {
  const leading = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  // Day zero of the next month is the last day of this one, leap years included.
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const trailing = (DAYS_PER_WEEK - ((leading + daysInMonth) % DAYS_PER_WEEK)) % DAYS_PER_WEEK;

  // One pass over the tasks, so placing them costs the same however many days are drawn.
  const byDay = new Map<string, Task[]>();
  for (const task of tasks) {
    const due = byDay.get(task.deadline);
    if (due) due.push(task);
    else byDay.set(task.deadline, [task]);
  }

  const days = Array.from({ length: daysInMonth }, (_, index): CalendarCell<Task> => {
    const date = index + 1;
    const day = `${year}-${twoDigits(month)}-${twoDigits(date)}`;

    return { day, date, isToday: day === today, tasks: byDay.get(day) ?? [] };
  });

  return [...Array<null>(leading).fill(null), ...days, ...Array<null>(trailing).fill(null)];
}

/** The month a number of months away; the year turns over at either end. */
export function shiftMonth({ year, month }: CalendarMonth, delta: number): CalendarMonth {
  const moved = new Date(Date.UTC(year, month - 1 + delta, 1));

  return { year: moved.getUTCFullYear(), month: moved.getUTCMonth() + 1 };
}

/** How the calendar's heading reads the month. */
export function monthLabel({ year, month }: CalendarMonth): string {
  return MONTH_LABEL.format(new Date(Date.UTC(year, month - 1, 1)));
}
