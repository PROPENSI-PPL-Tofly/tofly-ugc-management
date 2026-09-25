import {
  Body,
  Controller,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';

import type { RevisionRequest } from './revise-submission.js';
import { checkRevisionRequest } from './revise-submission.js';

export interface SubmissionReviser {
  revise(
    submissionId: string,
    input: RevisionRequest,
  ): Promise<unknown>;
}

@Controller('submissions')
export class SubmissionRevisionController {
  constructor(
    @Inject('SubmissionRevisionService')
    private readonly revisions: SubmissionReviser,
  ) {}

  @Patch(':id/revise')
  async revise(
    @Param('id', ParseUUIDPipe) submissionId: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    const validatedBody = checkRevisionRequest(body);

    return this.revisions.revise(
      submissionId,
      validatedBody,
    );
  }
}