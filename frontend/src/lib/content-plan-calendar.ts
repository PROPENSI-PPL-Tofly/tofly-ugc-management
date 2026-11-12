// The Content Plan calendar (I3.6): every creator's content on one month, coloured by content
// type. The grid and month arithmetic are Task Saya's (task-calendar.ts) and the overdue rule is
// Creator Detail's (creator-calendar.ts); this module only adds what the cross-creator view says
// on a chip and which month it covers.
//
// Pure module with no clock of its own: callers pass "today" (Jakarta time), so tests pin it.

import { CONTENT_STATUS_LABELS } from "./content-labels";
import type { ContentPlanRow } from "./content-plan";
import { creatorCalendarGroup } from "./creator-calendar";
import type { CalendarMonth } from "./task-calendar";

/** The most rows GET /contents hands out in one request. */
export const CALENDAR_PAGE_SIZE = 50;

/**
 * The most pages one month may take: about a thousand contents. Past it the calendar refuses to
 * draw rather than drawing part of the month as if it were all of it.
 */
export const CALENDAR_PAGE_LIMIT = 20;

/** The most contents one month draws: the page limit's worth of the largest pages. */
export const CALENDAR_MAX_ITEMS = CALENDAR_PAGE_LIMIT * CALENDAR_PAGE_SIZE;

export const OVERDUE_LABEL = "Overdue";
export const PENDING_PROPOSAL_LABEL = "Menunggu persetujuan";

type ChipRow = Pick<ContentPlanRow, "name" | "creatorName" | "status" | "tags">;

/** The month the address names ("YYYY-MM", already checked), or today's when it names none. */
export function shownMonth(month: string, today: string): CalendarMonth {
  const day = month || today;
  return { year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)) };
}

/** The first and last day of a month, as the API's deadline range reads them. */
export function monthRange({ year, month }: CalendarMonth): [string, string] {
  const first = new Date(Date.UTC(year, month - 1, 1))
    .toISOString()
    .slice(0, 10);
  // Day zero of the next month is the last day of this one, leap years included.
  const last = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return [first, last];
}

/**
 * Overdue as the other calendars group it: past its deadline and not finished. A late hand-in
 * keeps its overdue tag as history, but it is done, so it gets no mark.
 */
export function isCalendarOverdue(
  row: Pick<ChipRow, "status" | "tags">,
): boolean {
  return (
    creatorCalendarGroup({ status: row.status, tags: row.tags ?? [] }) ===
    "overdue"
  );
}

/** A creator's proposal still waiting for an admin: the lifecycle's "pending" status. */
export function isPendingProposal(row: Pick<ChipRow, "status">): boolean {
  return row.status === "pending";
}

function firstName(creatorName: string | undefined): string {
  return (creatorName ?? "").trim().split(/\s+/)[0] ?? "";
}

/** What a chip reads: "Salsa · Review Serum", or the content alone when no name came. */
export function calendarChipLabel(row: ChipRow): string {
  const creator = firstName(row.creatorName);
  return creator ? `${creator} · ${row.name}` : row.name;
}

/**
 * What a chip says in full, for its tooltip and for screen readers: the content, the creator's
 * whole name and the status, then the marks the chip shows only by colour or outline.
 */
export function calendarChipTitle(row: ChipRow): string {
  return [
    row.name,
    (row.creatorName ?? "").trim(),
    CONTENT_STATUS_LABELS[row.status] ?? row.status,
    isCalendarOverdue(row) ? OVERDUE_LABEL : "",
    isPendingProposal(row) ? PENDING_PROPOSAL_LABEL : "",
  ]
    .filter((part) => part !== "")
    .join(" · ");
}
