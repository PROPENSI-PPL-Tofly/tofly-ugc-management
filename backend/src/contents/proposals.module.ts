import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { CreatorsController } from '../creators/creators.controller.js';
import { MyContentsController } from '../me/my-contents.controller.js';
import { SubmissionRevisionController } from '../submissions/submission-revision.controller.js';
import { SubmissionsController } from '../submissions/submissions.controller.js';
import { ContentsController } from './contents.controller.js';
import { DraftSubmissionController } from './draft-submission.controller.js';
import { ProposalReviewController } from './proposal-review.controller.js';
import { ProposalReviewService } from './proposal-review.service.js';
import { ProposalSchedulingMiddleware } from './proposal-scheduling.middleware.js';
import { VideoSubmissionController } from './video-submission.controller.js';

/** A creator's proposals: the admin's decision on one, and their H-1 scheduling. */
@Module({
  controllers: [ProposalReviewController],
  providers: [ProposalReviewService],
  exports: [ProposalReviewService],
})
export class ProposalsModule implements NestModule {
  // Every route that shows or changes a content's status sees proposals already scheduled.
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(ProposalSchedulingMiddleware)
      .forRoutes(
        ContentsController,
        DraftSubmissionController,
        VideoSubmissionController,
        ProposalReviewController,
        CreatorsController,
        MyContentsController,
        SubmissionsController,
        SubmissionRevisionController,
      );
  }
}
