// Calendar-specific grouping and contract-month bounds. The actual grid and month arithmetic
// are shared with Task Saya in task-calendar.ts.

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

/** Matches the Content Plan's status groups; a late hand-in remains completed. */
export const CREATOR_CALENDAR_GROUPS: readonly CreatorCalendarGroupDef[] = [
  { key: "action", label: "Perlu Approval", tone: "amber" },
  { key: "waiting", label: "Menunggu Kreator", tone: "neutral" },
  { key: "done", label: "Selesai", tone: "green" },
  { key: "overdue", label: "Overdue", tone: "red" },
];

const TAB_GROUPS: readonly Exclude<CreatorCalendarGroup, "overdue">[] = ["action", "waiting", "done"];

export function creatorCalendarGroup(content: {
  status: ContentStatus;
  tags: readonly ContentTag[];
}): CreatorCalendarGroup {
  if (content.status === "link_submitted") return "done";
  if (content.tags.includes("overdue")) return "overdue";
  return TAB_GROUPS.find((tab) => statusInTab(tab, content.status)) as CreatorCalendarGroup;
}

function monthOf(day: string): CalendarMonth {
  return { year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)) };
}

export function isInPeriod(
  day: string,
  period: Pick<CreatorPeriod, "startDate" | "endDate">,
): boolean {
  return day >= period.startDate && day <= period.endDate;
}

export interface PeriodMonths {
  first: CalendarMonth;
  last: CalendarMonth;
  opening: CalendarMonth;
}

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
