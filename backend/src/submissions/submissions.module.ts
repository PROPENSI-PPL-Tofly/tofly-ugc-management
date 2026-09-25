import { Module } from '@nestjs/common';
import { SubmissionReviewService } from './submission-review.service.js';
import { SubmissionsController } from './submissions.controller.js';

@Module({
  controllers: [SubmissionsController],
  providers: [SubmissionReviewService],
})
export class SubmissionsModule {}
