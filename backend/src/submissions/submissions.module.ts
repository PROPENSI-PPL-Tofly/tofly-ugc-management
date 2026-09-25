import { Module } from '@nestjs/common';
import { SubmissionDetailService } from './submission-detail.service.js';
import { SubmissionReviewService } from './submission-review.service.js';
import { SubmissionsController } from './submissions.controller.js';

@Module({
  controllers: [SubmissionsController],
  providers: [SubmissionReviewService, SubmissionDetailService],
})
export class SubmissionsModule {}
