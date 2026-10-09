import { checkReviewable } from './draft-review.js';
import type { RevisedSubmission } from './dto/revised-submission.dto.js';
import { reviewConflict, submissionNotFound } from './review-errors.js';
import type { RevisionRequest } from './revise-submission.js';

/** What the service needs to know about a submission before it asks for a revision. */
export interface SubmissionUnderRevision {
  id: string;
  content_id: string;
  /** The status of the content the submission belongs to. */
  status: string;
  /** Whether this submission is the content's most recent hand-in. */
  isLatest: boolean;
}

/**
 * Where the service reads and saves a revision. The service depends on this, not on the Prisma
 * repository that implements it, so a test can hand it a stub.
 */
export interface RevisionStore {
  findById(submissionId: string): Promise<SubmissionUnderRevision | null>;

  saveRevision(
    submissionId: string,
    contentId: string,
    revisionNotes: string,
  ): Promise<RevisedSubmission | null>;
}

export class SubmissionRevisionService {
  constructor(
    private readonly repository: RevisionStore,
  ) {}

  async revise(
    submissionId: string,
    input: RevisionRequest,
  ): Promise<RevisedSubmission> {
    const submission = await this.repository.findById(submissionId);

    if (!submission) {
      throw submissionNotFound();
    }

    const rejected = checkReviewable({
      contentStatus: submission.status,
      isLatest: submission.isLatest,
    });

    if (rejected) {
      throw reviewConflict(rejected);
    }

    const result = await this.repository.saveRevision(
      submissionId,
      submission.content_id,
      input.revisionNotes,
    );

    if (!result) {
      throw reviewConflict('DRAFT_NOT_REVIEWABLE');
    }

    return result;
  }
}