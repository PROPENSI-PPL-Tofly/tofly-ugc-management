import {
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import {
  checkReviewable,
  type ReviewRejection,
} from './draft-review.js';
import type { RevisionRequest } from './revise-submission.js';

interface RevisionResult {
  id: string;
  status: string;
  revisionNotes: string | null;
}

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
  ): Promise<RevisionResult | null>;
}

const REJECTION_MESSAGES: Record<ReviewRejection, string> = {
  DRAFT_NOT_REVIEWABLE: 'Draft ini sudah tidak menunggu keputusan',
  SUBMISSION_SUPERSEDED: 'Creator sudah mengirim draft yang lebih baru',
};

function conflict(code: ReviewRejection): ConflictException {
  return new ConflictException({
    code,
    message: REJECTION_MESSAGES[code],
  });
}

export class SubmissionRevisionService {
  constructor(
    private readonly repository: SubmissionRevisionRepository,
  ) {}

  async revise(
    submissionId: string,
    input: RevisionRequest,
  ): Promise<RevisionResult> {
    const submission = await this.repository.findById(submissionId);

    if (!submission) {
      throw new NotFoundException('Submission tidak ditemukan');
    }

    const rejected = checkReviewable({
      contentStatus: submission.status,
      isLatest: submission.isLatest,
    });

    if (rejected) {
      throw conflict(rejected);
    }

    const result = await this.repository.saveRevision(
      submissionId,
      submission.content_id,
      input.revisionNotes,
    );

    if (!result) {
      throw conflict('DRAFT_NOT_REVIEWABLE');
    }

    return result;
  }
}