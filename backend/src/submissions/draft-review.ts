import { REVIEWABLE_STATUSES } from '../contents/content-lifecycle.js';

// A draft waits for an Admin decision only while its content is reviewable, whether it is a
// first hand-in or a resubmit. Approve and revise both start from here, so they share the
// lifecycle's list with the review queue.
export { REVIEWABLE_STATUSES };

export type ReviewRejection = 'DRAFT_NOT_REVIEWABLE' | 'SUBMISSION_SUPERSEDED';

export interface DraftUnderReview {
  contentStatus: string;
  /** Whether this submission is the content's most recent hand-in. */
  isLatest: boolean;
}

/**
 * Returns why a decision on this submission is not allowed, or null when it is.
 * The content's status wins over staleness: once a draft is decided, "already decided" is the
 * accurate answer for every one of its submissions.
 */
export function checkReviewable(
  draft: DraftUnderReview,
): ReviewRejection | null {
  const reviewable: readonly string[] = REVIEWABLE_STATUSES;
  if (!reviewable.includes(draft.contentStatus)) {
    return 'DRAFT_NOT_REVIEWABLE';
  }
  return draft.isLatest ? null : 'SUBMISSION_SUPERSEDED';
}
