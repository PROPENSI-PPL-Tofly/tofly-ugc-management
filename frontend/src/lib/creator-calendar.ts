// The Creator Detail calendar: one contract period as months, each content on its deadline day.
// Pure module, so the grid and the colours are tested without rendering. The grid itself is
// Task Saya's (monthGrid in task-calendar); only the admin's grouping and the period's bounds
// live here.

import type { Tone } from "@/components/ui/pill";
import { statusInTab, type ContentPlanTab } from "./content-plan";
import type { CreatorPeriod } from "./creator-detail";
import type { ContentStatus, ContentTag } from "./creators";
import type { CalendarMonth } from "./task-calendar";

export type CreatorCalendarGroup = Exclude<ContentPlanTab, "all"> | "overdue";

export interface CreatorCalendarGroupDef {
  key: CreatorCalendarGroup;
  label: string;
  tone: Tone;
}

/**
 * The legend, in its order: the Content Plan's tabs, whose ball each content is in, so the
 * calendar and the table below it group alike. Overdue comes first in judgement but last in
 * the legend, as on Task Saya.
 */
export const CREATOR_CALENDAR_GROUPS: readonly CreatorCalendarGroupDef[] = [
  { key: "action", label: "Perlu Approval", tone: "amber" },
  { key: "waiting", label: "Menunggu Kreator", tone: "neutral" },
  { key: "done", label: "Selesai", tone: "green" },
  { key: "overdue", label: "Overdue", tone: "red" },
];

const TAB_GROUPS: readonly Exclude<CreatorCalendarGroup, "overdue">[] = ["action", "waiting", "done"];

/**
 * A finished content sits under Selesai, however late it came; any other content past its
 * deadline is overdue first; otherwise it sits in the tab that holds it.
 */
export function creatorCalendarGroup(content: {
  status: ContentStatus;
  tags: readonly ContentTag[];
}): CreatorCalendarGroup {
  if (content.status === "link_submitted") return "done";
  if (content.tags.includes("overdue")) return "overdue";

  // Every status is in exactly one of the three tabs, so the search always finds one.
  return TAB_GROUPS.find((tab) => statusInTab(tab, content.status)) as CreatorCalendarGroup;
}

/** The month a calendar day falls in. */
function monthOf(day: string): CalendarMonth {
  return { year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)) };
}

/** Whether a calendar day falls within the period, its first and last day included. */
export function isInPeriod(day: string, period: Pick<CreatorPeriod, "startDate" | "endDate">): boolean {
  return day >= period.startDate && day <= period.endDate;
}

export interface PeriodMonths {
  first: CalendarMonth;
  last: CalendarMonth;
  /** Today's month while the period runs; its first month before it starts and after it ends. */
  opening: CalendarMonth;
}

/** The months a period's calendar walks through, and the one it opens on. */
export function periodMonths(
  period: Pick<CreatorPeriod, "startDate" | "endDate">,
  today: string,
): PeriodMonths {
  const first = monthOf(period.startDate);

  return {
    first,
    last: monthOf(period.endDate),
    opening: isInPeriod(today, period) ? monthOf(today) : first,
  };
}
