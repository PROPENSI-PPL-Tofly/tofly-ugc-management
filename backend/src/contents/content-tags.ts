// Tags that flag a content item for an admin's attention. Overdue is derived from the content's
// dates and status every time it is read and is never stored, so it can not drift from the data.
// It covers both ways of missing a deadline: still open past it, or handed in after it, so a
// finished content keeps saying it was late. The bypass flag is the exception: once a video link skips the draft
// approval nothing else records that it happened, so it is passed in as stored.
//
// Days are compared as calendar days in Jakarta, where admins and creators work; a hand-in on
// the deadline day itself is on time.

import { jakartaDay } from '../creators/evergreen.js';
import { COMMITTED_STATUSES, type ContentStatus } from './content-lifecycle.js';

export type ContentTag = 'overdue' | 'approval_bypassed';

/** Every tag, in the order contentTags reports them. */
export const CONTENT_TAGS: readonly ContentTag[] = [
  'overdue',
  'approval_bypassed',
];

export interface ContentTagInput {
  /** Postgres `date`, midnight UTC. */
  deadline: Date;
  status: ContentStatus;
  /** Postgres `date`, midnight UTC. */
  videoSubmittedAt: Date | null;
  /** When the latest draft was handed in. */
  latestDraftAt: Date | null;
  approvalBypassed: boolean;
}

/** Whether a hand-in fell on a Jakarta day after the deadline day. */
function handedInLate(at: Date | null, deadlineDay: string): boolean {
  return at !== null && jakartaDay(at) > deadlineDay;
}

export function contentTags(input: ContentTagInput, today: Date): ContentTag[] {
  // A midnight-UTC date is 07:00 the same day in Jakarta, so jakartaDay keeps its calendar day.
  const deadlineDay = jakartaDay(input.deadline);
  const committed = (COMMITTED_STATUSES as readonly ContentStatus[]).includes(
    input.status,
  );

  const lateHandIn =
    handedInLate(input.latestDraftAt, deadlineDay) ||
    handedInLate(input.videoSubmittedAt, deadlineDay);
  const openPastDeadline =
    committed &&
    input.videoSubmittedAt === null &&
    input.status !== 'link_submitted' &&
    deadlineDay < jakartaDay(today);

  const present: Record<ContentTag, boolean> = {
    overdue: lateHandIn || openPastDeadline,
    approval_bypassed: input.approvalBypassed,
  };

  return CONTENT_TAGS.filter((tag) => present[tag]);
}
