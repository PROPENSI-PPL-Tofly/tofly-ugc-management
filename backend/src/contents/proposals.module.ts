import { Module } from '@nestjs/common';
import { ProposalReviewController } from './proposal-review.controller.js';
import { ProposalReviewService } from './proposal-review.service.js';

/** A creator's proposals: the admin's decision on one, and their H-1 scheduling. */
@Module({
  controllers: [ProposalReviewController],
  providers: [ProposalReviewService],
  exports: [ProposalReviewService],
})
export class ProposalsModule {}
