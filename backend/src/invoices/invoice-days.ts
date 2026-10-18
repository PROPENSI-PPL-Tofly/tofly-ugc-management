// Calendar-day arithmetic for invoices, in Jakarta where admins and creators work. A hand-in on
// the deadline day itself is on time, the same rule content-tags.ts applies to its tags.

import { jakartaDay } from '../creators/evergreen.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole calendar days from one YYYY-MM-DD day to another; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      MS_PER_DAY,
  );
}

/** Days a hand-in came after the deadline day; 0 when it was on time. */
export function daysLate(deadline: Date, handedIn: Date): number {
  return Math.max(0, daysBetween(jakartaDay(deadline), jakartaDay(handedIn)));
}

/** Whether a video link arrived on or before the deadline day. */
export function onTime(deadline: Date, handedIn: Date | null): boolean {
  return handedIn !== null && daysLate(deadline, handedIn) === 0;
}

/** The last day the contract counts: its end, or the day access was revoked if that came first. */
export function contractLastDay(contract: {
  endDate: Date;
  endedEarlyOn: Date | null;
}): string {
  const end = jakartaDay(contract.endDate);
  if (contract.endedEarlyOn === null) return end;
  const revoked = jakartaDay(contract.endedEarlyOn);
  return revoked < end ? revoked : end;
}
