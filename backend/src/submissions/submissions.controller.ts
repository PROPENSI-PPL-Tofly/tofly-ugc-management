import {
  Controller,
  DefaultValuePipe,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { checkPaging, DEFAULT_PAGE_SIZE } from '../creators/paging.js';
import type { ApprovedSubmission } from './dto/approved-submission.dto.js';
import type { ReviewQueueResponse } from './dto/review-queue.dto.js';
import { checkQueueQuery } from './review-queue.js';
import {
  ReviewQueueService,
  type ReviewQueueLister,
} from './review-queue.service.js';
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
    @Inject(ReviewQueueService)
    private readonly queue: ReviewQueueLister,
  ) {}

  /**
   * The Admin draft review queue (PRD 3.11): drafts waiting for a decision, resubmits first,
   * 10 rows per page. The pipes turn a non-integer page into a 400, checkPaging bounds it, and
   * checkQueueQuery answers 400 for any status/filter value the queue cannot hold, so only
   * checked values reach the database.
   *
   * No guard yet: the backend has no authentication, so for now anyone who can reach the API
   * can read the queue. Admin-only access belongs with the Google sign-in work (PRD 3.1).
   */
  @Get()
  async listQueue(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(DEFAULT_PAGE_SIZE), ParseIntPipe)
    pageSize: number,
    @Query('status') status?: unknown,
    @Query('q') q?: unknown,
    @Query('type') type?: unknown,
    @Query('filterStatus') filterStatus?: unknown,
    @Query('overdue') overdue?: unknown,
  ): Promise<ReviewQueueResponse> {
    return this.queue.list(
      checkPaging(page, pageSize),
      new Date(),
      checkQueueQuery({ status, q, type, filterStatus, overdue }),
    );
  }

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
