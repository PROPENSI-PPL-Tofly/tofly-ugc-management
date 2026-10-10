import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard, type AdminRequest } from '../auth/admin.guard.js';
import { unauthenticated } from '../auth/creator-request.js';
import {
  ContentEventHistoryService,
  type ContentEventRecord,
} from './content-event-history.service.js';
import { ContentCreationService } from './contents.service.js';
import { checkNewContent, type NewContent } from './new-content.js';

export interface ContentCreator {
  create(input: NewContent, adminUserId: string): Promise<unknown>;
}

@Controller('contents')
@UseGuards(AdminGuard)
export class ContentsController {
  constructor(
    @Inject(ContentCreationService)
    private readonly contents: ContentCreator,
    @Inject(ContentEventHistoryService)
    private readonly eventHistory: Pick<
      ContentEventHistoryService,
      'getForContent'
    >,
  ) {}

  @Get(':id/events')
  async getEventHistory(
    @Param('id', new ParseUUIDPipe()) contentId: string,
  ): Promise<ContentEventRecord[]> {
    return this.eventHistory.getForContent(contentId);
  }

  @Post()
  async create(
    @Body() body: unknown,
    @Req() request: AdminRequest,
  ): Promise<unknown> {
    const validated = checkNewContent(body);
    if (request.principal?.role !== 'admin') {
      throw unauthenticated();
    }
    return this.contents.create(validated, request.principal.userId);
  }
}
