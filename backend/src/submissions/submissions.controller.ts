import {
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import type { ApprovedSubmission } from './dto/approved-submission.dto.js';
import {
  SubmissionDetailService,
  type SubmissionDetail,
} from './submission-detail.service.js';
import { SubmissionReviewService } from './submission-review.service.js';

export interface DraftApprover {
  approve(id: string): Promise<ApprovedSubmission>;
}

export interface SubmissionDetailReader {
  getDetail(id: string): Promise<SubmissionDetail>;
}

@Controller('submissions')
export class SubmissionsController {
  constructor(
    @Inject(SubmissionReviewService)
    private readonly review: DraftApprover,
    @Inject(SubmissionDetailService)
    private readonly detail: SubmissionDetailReader,
  ) {}

  /**
   * Get submission detail for the Admin Draft Preview.
   *
   * ParseUUIDPipe answers a malformed id with 400 before anything reaches
   * the database; the service answers 404 when the submission does not exist.
   */
  @Get(':id')
  async getDetail(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<SubmissionDetail> {
    return this.detail.getDetail(id);
  }

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
