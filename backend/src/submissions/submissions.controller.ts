import {
  Controller,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import type { ApprovedSubmission } from './dto/approved-submission.dto.js';
import { SubmissionReviewService } from './submission-review.service.js';

export interface DraftApprover {
  approve(id: string): Promise<ApprovedSubmission>;
}

@Controller('submissions')
export class SubmissionsController {
  constructor(
    @Inject(SubmissionReviewService)
    private readonly review: DraftApprover,
  ) {}

  /**
   * Approve a draft from the review queue (PRD 3.11): the content becomes Draft Approved,
   * which takes it out of the queue. ParseUUIDPipe answers a malformed id with 400 before
   * anything reaches the database; the service answers 404/409 for the rest.
   *
   * No guard yet: the backend has no authentication, so for now anyone who can reach the API
   * can approve a draft. Admin-only access belongs with the Google sign-in work (PRD 3.1).
   */
  @Patch(':id/approve')
  async approve(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ApprovedSubmission> {
    return this.review.approve(id);
  }
}
