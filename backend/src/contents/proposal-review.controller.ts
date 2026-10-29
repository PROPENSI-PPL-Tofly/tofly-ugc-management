import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard, type AdminRequest } from '../auth/admin.guard.js';
import { checkRejectReason } from './proposal-review.js';
import {
  ProposalReviewService,
  type ApprovedProposal,
  type RejectedProposal,
} from './proposal-review.service.js';

/**
 * An admin's decision on a creator's proposal, from the Content Detail panel. AdminGuard also
 * checks the request comes from this app's own origin, as for every state change.
 * ParseUUIDPipe answers a malformed id with 400 before anything reaches the database.
 */
@Controller('contents')
@UseGuards(AdminGuard)
export class ProposalReviewController {
  constructor(
    @Inject(ProposalReviewService)
    private readonly proposals: Pick<ProposalReviewService, 'approve' | 'reject'>,
  ) {}

  @Patch(':id/proposal/approve')
  async approve(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Pick<AdminRequest, 'principal'>,
  ): Promise<ApprovedProposal> {
    // The admin the guard signed in, for the history; absent only behind the local stand-in.
    return this.proposals.approve(id, request.principal?.userId);
  }

  /** POST, not DELETE: it carries a body (the optional reason) and answers what happened. */
  @Post(':id/proposal/reject')
  @HttpCode(200)
  async reject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ): Promise<RejectedProposal> {
    return this.proposals.reject(id, checkRejectReason(body));
  }
}
