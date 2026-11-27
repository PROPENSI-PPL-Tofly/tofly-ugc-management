// The executive dashboard's one filter: how many months to show. One vocabulary for the
// controller's 400 and the service's query windows, so the KPI cards and every chart compare
// the same range of days with the same-length range before it.

import { jakartaDay } from '../creators/evergreen.js';
import { reject } from '../list-query.js';

export const DASHBOARD_RANGES = [3, 6, 12] as const;
export type DashboardRangeMonths = (typeof DASHBOARD_RANGES)[number];
export const DEFAULT_DASHBOARD_RANGE: DashboardRangeMonths = 6;

export interface ExecutiveRange {
  /** First and last day of the chosen window, as ISO calendar days. */
  from: string;
  to: string;
  /** The same-length window immediately before it, for every KPI's comparison. */
  previousFrom: string;
  previousTo: string;
}

export function checkDashboardRange(value: unknown): DashboardRangeMonths {
  if (value === undefined) return DEFAULT_DASHBOARD_RANGE;
  // ?range=6 arrives as the text "6"; only the exact written forms of 3, 6 and 12 are read.
  const months = DASHBOARD_RANGES.find((range) => value === range || value === String(range));
  if (months === undefined) {
    reject(`range must be one of ${DASHBOARD_RANGES.join(', ')}`);
  }
  return months as DashboardRangeMonths;
}

/** Every calendar month from `from` to `to` (ISO days), oldest first, as "YYYY-MM". */
export function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  for (let month = from.slice(0, 7); month <= to.slice(0, 7); month = day(firstOfMonth(month, 1)).slice(0, 7)) {
    months.push(month);
  }
  return months;
}

/** The first day of a month, as a Date, `delta` months from the named month. */
function firstOfMonth(month: string, delta: number): Date {
  const [year, index] = month.split('-').map(Number);
  return new Date(Date.UTC(year, index - 1 + delta, 1));
}

function day(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function lastDayOf(month: string): string {
  const next = firstOfMonth(month, 1);
  return day(new Date(next.getTime() - 1));
}

function dayBefore(iso: string): string {
  const [year, month, date] = iso.split('-').map(Number);
  return day(new Date(Date.UTC(year, month - 1, date - 1)));
}

/**
 * Six months, say, means the six whole calendar months ending with the one the admin is in
 * (Jakarta time), and the six whole months before that. Both windows are inclusive and the
 * same length, so every "change against the previous range" is a like-for-like comparison.
 */
export function dashboardRange(months: DashboardRangeMonths, today: Date): ExecutiveRange {
  const thisMonth = jakartaDay(today).slice(0, 7); // YYYY-MM in Jakarta, where admins work
  const to = lastDayOf(thisMonth);
  const from = day(firstOfMonth(thisMonth, -(months - 1)));
  const previousTo = dayBefore(from);

  return {
    from,
    to,
    previousFrom: day(firstOfMonth(previousTo.slice(0, 7), -(months - 1))),
    previousTo,
  };
}
