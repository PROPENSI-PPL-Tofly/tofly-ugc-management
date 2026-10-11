import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import { ProposalReviewService } from './proposal-review.service.js';

/**
 * Applies the lifecycle's time-based arrow (Pending → Scheduled at H-1) before any request that
 * reads or changes content, so every list, detail and hand-in sees the same status without a
 * scheduler: the app runs on Cloud Run with no instance kept awake. It is one small
 * UPDATE that changes nothing on most requests, and repeating it is harmless.
 */
@Injectable()
export class ProposalSchedulingMiddleware implements NestMiddleware {
  constructor(
    @Inject(ProposalReviewService)
    private readonly proposals: Pick<ProposalReviewService, 'scheduleDue'>,
  ) {}

  async use(_request: unknown, _response: unknown, next: (error?: unknown) => void): Promise<void> {
    try {
      await this.proposals.scheduleDue(new Date());
    } catch (error) {
      next(error);
      return;
    }
    next();
  }
}
