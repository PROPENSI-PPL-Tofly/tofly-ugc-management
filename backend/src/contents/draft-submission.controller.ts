import {
  Body,
  Controller,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  MockCreatorGuard,
  MockCurrentCreator,
} from './creator-identity.mock.js';
import { checkDraftSubmission } from './draft-submission.js';
import {
  DraftSubmissionService,
  type DraftSubmitter,
  type SubmittedDraft,
} from './draft-submission.service.js';

@Controller('contents')
export class DraftSubmissionController {
  constructor(
    @Inject(DraftSubmissionService)
    private readonly drafts: DraftSubmitter,
  ) {}

  /**
   * Submit/Resubmit Draft from Task Saya (PRD 3.16). The guard answers 401 before anything
   * else, ParseUUIDPipe a malformed id with 400, checkDraftSubmission a bad body with 422, and
   * the service 404 (not the caller's content) or 409 (no draft expected now).
   */
  @Post(':id/draft')
  @UseGuards(MockCreatorGuard)
  async submit(
    @Param('id', new ParseUUIDPipe()) contentId: string,
    @MockCurrentCreator() creatorId: string,
    @Body() body: unknown,
  ): Promise<SubmittedDraft> {
    return this.drafts.submit(contentId, creatorId, checkDraftSubmission(body));
  }
}
