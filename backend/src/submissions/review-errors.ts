import { ConflictException, NotFoundException } from '@nestjs/common';
import type { ReviewRejection } from './draft-review.js';

// The refusals every review action (approve, request revision) and the draft preview share.
// One place for the codes and wording, so a client handles a refusal once and by code, whichever
// action it came from.

const REJECTION_MESSAGES: Record<ReviewRejection, string> = {
  DRAFT_NOT_REVIEWABLE: 'Draft ini sudah tidak menunggu keputusan',
  SUBMISSION_SUPERSEDED: 'Creator sudah mengirim draft yang lebih baru',
};

/** 404: no submission has this id. */
export function submissionNotFound(): NotFoundException {
  return new NotFoundException({
    code: 'SUBMISSION_NOT_FOUND',
    message: 'Draft tidak ditemukan',
  });
}

/** 409: the draft's current state does not allow a review decision. */
export function reviewConflict(code: ReviewRejection): ConflictException {
  return new ConflictException({ code, message: REJECTION_MESSAGES[code] });
}
