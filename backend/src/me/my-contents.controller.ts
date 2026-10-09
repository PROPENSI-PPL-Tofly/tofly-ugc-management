import {
  Controller,
  DefaultValuePipe,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentCreator } from '../auth/current-creator.decorator.js';
import { DevCreatorGuard } from '../auth/dev-creator.guard.js';
import { checkPaging } from '../creators/paging.js';
import {
  ContentDetailService,
  type ContentDetailReader,
} from '../contents/content-detail.service.js';
import type { ContentDetail } from '../contents/content-detail.js';
import type { MyContentsResponse } from './dto/my-contents.dto.js';
import {
  MyContentsService,
  type MyContentsLister,
} from './my-contents.service.js';
import { checkTaskStatus } from './task-status-filter.js';

/** The Task Saya table shows 5 rows per page (PRD 3.16). */
export const MY_CONTENTS_PAGE_SIZE = 5;

/**
 * Routes about the calling creator. Every query is scoped by the creator the guard resolved,
 * never by an id from the URL, so one creator cannot ask for another's work.
 *
 * The guard resolves the creator from the server-backed app session in production. Its
 * development-only header fallback does not establish a production identity.
 */
@Controller('me')
@UseGuards(DevCreatorGuard)
export class MyContentsController {
  constructor(
    @Inject(MyContentsService)
    private readonly contents: MyContentsLister,
    @Inject(ContentDetailService)
    private readonly contentDetail: ContentDetailReader,
  ) {}

  /**
   * The creator's Task Saya list by nearest deadline, each row with the actions it allows
   * today. The pipes turn a non-integer page into a 400, checkPaging bounds it and
   * checkTaskStatus accepts only a Task Saya status.
   */
  @Get('contents')
  async list(
    @CurrentCreator() creatorId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query(
      'pageSize',
      new DefaultValuePipe(MY_CONTENTS_PAGE_SIZE),
      ParseIntPipe,
    )
    pageSize: number,
    @Query('status') status: unknown,
  ): Promise<MyContentsResponse> {
    return this.contents.list(
      creatorId,
      { ...checkPaging(page, pageSize), status: checkTaskStatus(status) },
      new Date(),
    );
  }

  /**
   * The Content Detail panel a creator opens from Task Saya (PBI 6). The id is scoped to the
   * contract the guard resolved, so one creator cannot read another's content, and the
   * answer is 404 rather than 403 so the endpoint never confirms that an id exists.
   */
  @Get('contents/:id')
  async detail(
    @CurrentCreator() creatorId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ContentDetail> {
    return this.contentDetail.getDetail(id, new Date(), { creatorId });
  }
}
