// Pure rules for onboarding a creator: how their Evergreen contents are named and which
// deadlines the server accepts. Nothing here touches Nest or Prisma, so every rule is tested
// without a database and the persistence code only has to wire the results together.

// DeadlineWindow formats with readableDay from here; both only call each other inside functions,
// so the import cycle resolves before either is used.
import { DeadlineWindow } from '../deadline-buffer/deadline-window.js';

/**
 * `Evg_<sequence>_<Creator Name>_DDMMYYYY`, the product's naming rule for Evergreen content:
 * the sequence counts from 1 in deadline order and stays fixed once saved. `day` is an ISO
 * calendar day (`YYYY-MM-DD`); it is split as text so the name never depends on the server's
 * timezone.
 */
export function evergreenName(
  fullName: string,
  day: string,
  sequence: number,
): string {
  const [year, month, date] = day.split('-');
  const name = fullName.trim().replaceAll(/\s+/g, ' ');
  return `Evg_${sequence}_${name}_${date}${month}${year}`;
}

export interface NameParts {
  first_name: string;
  middle_name: string | null;
  last_name: string | null;
}

/**
 * The Add Creator form collects one name; the creators table keeps three columns. The first
 * word is the first name, the last word the last name, and anything between stays together
 * as the middle name so no part of a long Indonesian name is dropped.
 */
export function splitName(fullName: string): NameParts {
  const [first, ...rest] = fullName.trim().split(/\s+/);
  const last = rest.pop() ?? null;
  return {
    first_name: first,
    middle_name: rest.length > 0 ? rest.join(' ') : null,
    last_name: last,
  };
}

/** The inverse of splitName: the name shown for a creator, skipping the parts they lack. */
export function joinName(parts: NameParts): string {
  return [parts.first_name, parts.middle_name, parts.last_name]
    .filter(Boolean)
    .join(' ');
}

/** The part of a new creator that decides when their Evergreen contents fall due. */
export interface Schedule {
  contractStart: string;
  contractEnd: string;
  quota: number;
  /** One ISO calendar day per content: the auto-generated slots plus any placed by hand. */
  deadlines: string[];
}

export type ScheduleErrors = Partial<Record<keyof Schedule, string>>;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const INVALID_DAY = 'Format tanggal tidak valid';

/** A `YYYY-MM-DD` that names a day that exists; 2026-02-30 rolls over, so it fails the round trip. */
export function isCalendarDay(value: string): boolean {
  if (!ISO_DAY.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
  );
}

// The earliest and latest deadline lines live in DeadlineWindow (src/deadline-buffer), both drawn
// by the one stored buffer (PBI-23 AC 22); PBI-38's fixed H-5 line is now H-N.

/** Today's calendar day where the admins work (WIB), so "not before today" holds after midnight. */
export function jakartaDay(now: Date): string {
  return JAKARTA_DAY.format(now);
}

// Hoisted with the other formatters: jakartaDay is called per row while tags are judged, and a
// DateTimeFormat constructed per call showed as 89.6% of the day-formatting workload's CPU in
// scripts/bench/profile-workload.mjs (see docs/perf/profiling-notes.md).
const JAKARTA_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' });

const READABLE_DAY = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** A YYYY-MM-DD day as admins read it in a message, e.g. "3 Okt 2026". */
export function readableDay(day: string): string {
  return READABLE_DAY.format(new Date(`${day}T00:00:00Z`));
}

/** Today in Jakarta as midnight UTC, the form Postgres `date` columns arrive in, for day-wise comparisons. */
export function jakartaMidnight(now: Date): Date {
  return new Date(`${jakartaDay(now)}T00:00:00Z`);
}

function deadlineProblem(
  schedule: Schedule,
  today: string,
  bufferDays: number,
): string | undefined {
  const { contractStart, contractEnd, quota, deadlines } = schedule;
  if (!deadlines.every(isCalendarDay)) {
    return 'Format tanggal deadline tidak valid';
  }
  // ISO days compare correctly as strings; contractStart is already known to be >= today.
  if (deadlines.some((day) => day < contractStart || day > contractEnd)) {
    return 'Deadline harus di dalam periode kontrak';
  }
  // PBI-23 AC 22: the stored buffer draws the latest line (PBI-38's H-5 is now H-N).
  const window = DeadlineWindow.of({ ...schedule, today, bufferDays });
  if (deadlines.some((day) => day > window.latest)) {
    return window.tooLate();
  }
  if (deadlines.length !== quota) {
    return `Jumlah deadline harus sama dengan jumlah konten (${quota})`;
  }
  return undefined;
}

/**
 * Re-runs on the server what the Add Creator form checks in the browser, since a request can
 * skip the form entirely. Returns one message per field, empty when the schedule is valid.
 * Deadlines are only judged once the contract period they must fit in is itself valid.
 */
export function checkSchedule(
  schedule: Schedule,
  today: string,
  bufferDays: number,
): ScheduleErrors {
  const { contractStart, contractEnd, quota } = schedule;
  const errors: ScheduleErrors = {};

  if (!isCalendarDay(contractStart)) {
    errors.contractStart = INVALID_DAY;
  } else if (contractStart < today) {
    errors.contractStart = 'Tanggal mulai tidak boleh sebelum hari ini';
  }

  if (!isCalendarDay(contractEnd)) {
    errors.contractEnd = INVALID_DAY;
  } else if (
    errors.contractStart === undefined &&
    contractStart > contractEnd
  ) {
    errors.contractStart = 'Tanggal mulai tidak boleh setelah tanggal berakhir';
  }

  if (quota < 1) {
    errors.quota = 'Jumlah konten harus lebih dari 0';
  }

  if (Object.keys(errors).length > 0) {
    return errors;
  }

  const deadlines = deadlineProblem(schedule, today, bufferDays);
  return deadlines === undefined ? {} : { deadlines };
}
