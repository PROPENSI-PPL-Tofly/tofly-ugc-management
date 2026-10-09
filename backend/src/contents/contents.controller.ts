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
  ContentDetailService,
  type ContentDetailReader,
} from './content-detail.service.js';
import type { ContentDetail } from './content-detail.js';
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
    @Inject(ContentDetailService)
    private readonly detail: ContentDetailReader,
  ) {}

  @Post()
  async create(@Body() body: unknown): Promise<unknown> {
    const validated = checkNewContent(body);
    return this.contents.create(validated);
  }

  /**
   * The Content Detail panel an admin opens from every touchpoint (PBI 6). ParseUUIDPipe
   * answers a malformed id with 400 before anything reaches the database; the service
   * answers 404 when the content does not exist.
   */
  @Get(':id')
  async getDetail(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ContentDetail> {
    return this.detail.getDetail(id, new Date());
  }
}
