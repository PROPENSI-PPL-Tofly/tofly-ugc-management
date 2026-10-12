// What the admin Content Plan and the creator's Task Saya both do to their rows once loaded:
// order them by deadline, judge them overdue by their tags, and test a deadline against a
// period. One copy, so the two lists cannot sort or filter the same content differently.

import type { ContentTag } from './content-tags.js';

/** Nearest or furthest deadline first. */
export type DeadlineSort = 'deadline_asc' | 'deadline_desc';

/** What a row needs to be ordered: its ISO deadline, its name and its id. */
export interface DeadlineOrdered {
  id: string;
  name: string;
  deadline: string;
}

// Names are compared by one fixed collator, so the order is the same on a laptop, in CI and on
// the server whatever locale each of them runs in.
// Stryker disable next-line StringLiteral: not a gap. An empty locale makes the constructor throw while this file loads, so every suite that imports it fails before a test runs, and the runner counts a mutant with no failed test as survived.
const BY_NAME = new Intl.Collator('id');

/** ISO days and ids are plain ASCII, so their code-unit order is their order. */
function compareText(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}

/** Nearest or furthest deadline first; name and id keep rows sharing a day in place. */
export function compareByDeadline(sort: DeadlineSort) {
  const direction = sort === 'deadline_desc' ? -1 : 1;
  return (a: DeadlineOrdered, b: DeadlineOrdered): number =>
    direction * compareText(a.deadline, b.deadline) ||
    BY_NAME.compare(a.name, b.name) ||
    compareText(a.id, b.id);
}

/** Past its deadline with no link yet, or finished after it: both read as overdue. */
export function isOverdue(tags: readonly ContentTag[]): boolean {
  return tags.includes('overdue') || tags.includes('late_submission');
}

/** A calendar day as Postgres `date` columns hold it: midnight UTC. */
export function asDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/** An inclusive deadline period; an end left out is open. */
export interface DeadlinePeriod {
  deadlineFrom?: string;
  deadlineTo?: string;
}

/** Whether an ISO deadline falls inside the period; always, when none is asked. */
export function withinPeriod({ deadlineFrom, deadlineTo }: DeadlinePeriod) {
  // ISO days order the same as text and as dates.
  return (deadline: string): boolean =>
    !(deadlineFrom && deadline < deadlineFrom) &&
    !(deadlineTo && deadline > deadlineTo);
}

/** The period as the `gte`/`lte` a Prisma `date` filter takes, or null when none is asked. */
export function deadlineWhere({
  deadlineFrom,
  deadlineTo,
}: DeadlinePeriod): { gte?: Date; lte?: Date } | null {
  if (!deadlineFrom && !deadlineTo) {
    return null;
  }
  const deadline: { gte?: Date; lte?: Date } = {};
  if (deadlineFrom) {
    deadline.gte = asDate(deadlineFrom);
  }
  if (deadlineTo) {
    deadline.lte = asDate(deadlineTo);
  }
  return deadline;
}
