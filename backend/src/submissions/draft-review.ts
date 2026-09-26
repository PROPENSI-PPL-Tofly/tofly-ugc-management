// A draft waits for an Admin decision only in these content statuses: the first hand-in
// (draft_review) and a hand-in after a revision request (draft_revised). Approve and revise
// both start from here, so they share this list with the review queue.
export const REVIEWABLE_STATUSES = ['draft_review', 'draft_revised'] as const;

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
