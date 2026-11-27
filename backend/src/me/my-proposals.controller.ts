import {
  Body,
  Controller,
  Delete,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentCreator } from '../auth/current-creator.decorator.js';
import { DevCreatorGuard } from '../auth/dev-creator.guard.js';
import { checkNewProposal } from './my-proposal.js';
import {
  MyProposalsService,
  type CreatedProposal,
  type ProposalKeeper,
  type WithdrawnProposal,
} from './my-proposals.service.js';

/**
 * "Ajukan Konten" and "Batalkan Pengajuan" (PBI-14, 14.1). Whose proposal it is comes from the
 * creator the guard resolved, never from the body or the URL, so one creator cannot propose on
 * or withdraw for another. The body is taken as `unknown` and checked by checkNewProposal; only
 * the validated fields reach the service, and a field the form does not have is dropped.
 */
@Controller('me/contents/proposals')
@UseGuards(DevCreatorGuard)
export class MyProposalsController {
  constructor(
    @Inject(MyProposalsService) private readonly proposals: ProposalKeeper,
  ) {}

  @Post()
  create(
    @CurrentCreator() creatorId: string,
    @Body() body: unknown,
  ): Promise<CreatedProposal> {
    return this.proposals.create(creatorId, checkNewProposal(body));
  }

  @Delete(':id')
  cancel(
    @CurrentCreator() creatorId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<WithdrawnProposal> {
    return this.proposals.cancel(creatorId, id);
  }
}
