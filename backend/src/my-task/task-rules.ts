// When a creator may submit what, for one piece of content.
//
// Pure functions over plain values, with `today` passed in, for the same reason as
// creator-metrics.ts: these rules decide whether a button is enabled and whether the server
// answers 409, so they must be readable and testable on their own, and the list endpoint
// and the submit endpoints must read the exact same rule.
//
// Status vocabulary (content_status enum → PRD name):
//   scheduled      → Scheduled
//   draft_review   → Draft Waiting for Review ("Draft Needs Review")
//   draft_revision → Draft Waiting for Revision ("Draft Needs Revision")
//   draft_approved → Draft Approved
//   link_submitted → Content Link Submitted
// `draft_revised` also exists in the enum but the PRD names no such state; this PBI never
// writes it and treats it as eligible for nothing. A resubmitted draft goes back to
// draft_review, and "resubmitted" is told apart by its submission count.

export type ContentStatus =
  | 'scheduled'
  | 'draft_review'
  | 'draft_revision'
  | 'draft_revised'
  | 'draft_approved'
  | 'link_submitted';

/** Statuses from which a draft may be (re)submitted. */
export const DRAFT_ELIGIBLE_STATUSES: readonly ContentStatus[] = [
  'scheduled',
  'draft_revision',
];

/** The grace window opens this many days before the deadline (H-1). */
export const GRACE_DAYS = 1;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Midnight UTC, matching how Postgres `date` columns arrive, so comparisons are day-wise. */
function atMidnight(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Whole days from today until the deadline: 0 on the day itself, negative once it passed. */
export function daysUntil(deadline: Date, today: Date): number {
  return Math.round((atMidnight(deadline) - atMidnight(today)) / MS_PER_DAY);
}

export function canSubmitDraft(status: ContentStatus): boolean {
  return DRAFT_ELIGIBLE_STATUSES.includes(status);
}

/**
 * H-1 or later. A deadline already passed still counts: the window exists so a creator
 * whose draft was never approved can still hand in the video, and that need does not end
 * at midnight on the deadline.
 */
export function isInGracePeriod(deadline: Date, today: Date): boolean {
  return daysUntil(deadline, today) <= GRACE_DAYS;
}

export function canSubmitVideo(
  status: ContentStatus,
  deadline: Date,
  today: Date,
): boolean {
  if (status === 'link_submitted') return false;
  return status === 'draft_approved' || isInGracePeriod(deadline, today);
}
