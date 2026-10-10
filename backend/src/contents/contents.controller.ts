import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard.js';
import {
  ContentEventHistoryService,
  type ContentEventRecord,
} from './content-event-history.service.js';
import { ContentCreationService } from './contents.service.js';
import { checkNewContent, type NewContent } from './new-content.js';

export interface ContentCreator {
  create(input: NewContent): Promise<unknown>;
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
  async create(@Body() body: unknown): Promise<unknown> {
    const validated = checkNewContent(body);
    return this.contents.create(validated);
  }
}
