import { checkReviewable } from './draft-review.js';
import type { RevisedSubmission } from './dto/revised-submission.dto.js';
import { reviewConflict, submissionNotFound } from './review-errors.js';
import type { RevisionRequest } from './revise-submission.js';

export interface SubmissionRevisionRepository {
  findById(
    submissionId: string,
  ): Promise<{
    id: string;
    content_id: string;
    status: string;
    isLatest: boolean;
  } | null>;

  saveRevision(
    submissionId: string,
    contentId: string,
    revisionNotes: string,
  ): Promise<RevisedSubmission | null>;
}

export class SubmissionRevisionService {
  constructor(
    private readonly repository: SubmissionRevisionRepository,
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