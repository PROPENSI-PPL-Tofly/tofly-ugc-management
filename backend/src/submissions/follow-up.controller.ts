import {
  Body,
  Controller,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard, type AdminRequest } from '../auth/admin.guard.js';
import { unauthenticated } from '../auth/creator-request.js';
import { checkFollowUp } from './follow-up-note.js';
import type { FollowUpDto } from './follow-up.service.js';

// What the controller needs from the service, so tests hand it a stand-in.
export interface FollowUpAdder {
  add(
    submissionId: string,
    note: string,
    adminUserId: string,
  ): Promise<FollowUpDto>;
}

// POST /submissions/:id/followups (PBI-33, 33.1): an admin adds a follow-up under the revision
// note already sent. Nest answers a POST with 201, the status the admin's form (33.2) expects.
@Controller('submissions')
@UseGuards(AdminGuard)
export class FollowUpController {
  constructor(
    @Inject('FollowUpService')
    private readonly followUps: FollowUpAdder,
  ) {}

  @Post(':id/followups')
  async add(
    @Param('id', ParseUUIDPipe) submissionId: string,
    @Body() body: unknown,
    @Req() request: AdminRequest,
  ): Promise<FollowUpDto> {
    const { note } = checkFollowUp(body);
    // OWASP A01: the follow-up records its author, so only a signed-in admin gets through.
    if (request.principal?.role !== 'admin') throw unauthenticated();

    return this.followUps.add(submissionId, note, request.principal.userId);
  }
}
