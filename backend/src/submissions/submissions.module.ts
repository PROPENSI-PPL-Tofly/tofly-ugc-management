import { Module } from '@nestjs/common';
import { ReviewQueueService } from './review-queue.service.js';
import { SubmissionDetailService } from './submission-detail.service.js';
import { SubmissionReviewService } from './submission-review.service.js';
import { SubmissionsController } from './submissions.controller.js';

@Module({
  controllers: [SubmissionsController],
  providers: [
    SubmissionReviewService,
    SubmissionDetailService,
    ReviewQueueService,
  ],
})
export class SubmissionsModule {}
