import {
  Body,
  Controller,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard, type AdminRequest } from '../auth/admin.guard.js';
import { unauthenticated } from '../auth/creator-request.js';

import type { RevisedSubmission } from './dto/revised-submission.dto.js';
import type { RevisionRequest } from './revise-submission.js';
import { checkRevisionRequest } from './revise-submission.js';

export interface SubmissionReviser {
  revise(
    submissionId: string,
    input: RevisionRequest,
    adminUserId: string,
  ): Promise<RevisedSubmission>;
}

@Controller('submissions')
@UseGuards(AdminGuard)
export class SubmissionRevisionController {
  constructor(
    @Inject('SubmissionRevisionService')
    private readonly revisions: SubmissionReviser,
  ) {}

  @Patch(':id/revise')
  async revise(
    @Param('id', ParseUUIDPipe) submissionId: string,
    @Body() body: unknown,
    @Req() request: AdminRequest,
  ): Promise<RevisedSubmission> {
    const validatedBody = checkRevisionRequest(body);
    if (request.principal?.role !== 'admin') throw unauthenticated();

    return this.revisions.revise(
      submissionId,
      validatedBody,
      request.principal.userId,
    );
  }
}