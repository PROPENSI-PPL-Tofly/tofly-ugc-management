import {
  Controller,
  DefaultValuePipe,
  Get,
  Inject,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentCreator } from '../auth/current-creator.decorator.js';
import { DevCreatorGuard } from '../auth/dev-creator.guard.js';
import { checkPaging } from '../creators/paging.js';
import type { MyContentsResponse } from './dto/my-contents.dto.js';
import {
  MyContentsService,
  type MyContentsLister,
} from './my-contents.service.js';

/** The Task Saya table shows 5 rows per page (PRD 3.16). */
export const MY_CONTENTS_PAGE_SIZE = 5;

/**
 * Routes about the calling creator. Every query is scoped by the creator the guard resolved,
 * never by an id from the URL, so one creator cannot ask for another's work.
 *
 * DevCreatorGuard is a development stand-in and answers 401 in production; Google sign-in
 * (PRD 3.1) replaces it without changing these routes.
 */
@Controller('me')
@UseGuards(DevCreatorGuard)
export class MyContentsController {
  constructor(
    @Inject(MyContentsService)
    private readonly contents: MyContentsLister,
  ) {}

  /**
   * The creator's Task Saya list: open tasks by nearest deadline, then submitted links, each
   * row with the actions it allows today. The pipes turn a non-integer page into a 400 and
   * checkPaging bounds it.
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
  ): Promise<MyContentsResponse> {
    return this.contents.list(
      creatorId,
      checkPaging(page, pageSize),
      new Date(),
    );
  }
}
