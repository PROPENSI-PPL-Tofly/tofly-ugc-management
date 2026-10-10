import {
  Controller,
  DefaultValuePipe,
  Get,
  Inject,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard.js';
import { checkPaging, DEFAULT_PAGE_SIZE } from '../creators/paging.js';
import { checkContentListQuery } from './content-list.js';
import {
  ContentListService,
  type ContentListLister,
} from './content-list.service.js';
import type { ContentListResponse } from './dto/content-list.dto.js';

// The list has its own controller so the routes that read or change one content keep theirs
// (SRP). It lists every creator's content, so only an admin may call it (OWASP A01).
@Controller('contents')
@UseGuards(AdminGuard)
export class ContentListController {
  constructor(
    @Inject(ContentListService)
    private readonly contents: ContentListLister,
  ) {}

  /**
   * The Admin Content Plan (PBI-5): every creator's content under the asked tab, 10 rows per
   * page, with a counter for each tab. The pipes turn a non-integer page into a 400,
   * checkPaging bounds it, and checkContentListQuery answers 400 for any tab, filter or sort
   * the list cannot hold, so only checked values reach the service. A filter sent more than
   * once (`?status=a&status=b`) arrives as a list.
   */
  @Get()
  async list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(DEFAULT_PAGE_SIZE), ParseIntPipe)
    pageSize: number,
    @Query('tab') tab?: unknown,
    @Query('q') q?: unknown,
    @Query('creator') creator?: unknown,
    @Query('type') type?: unknown,
    @Query('status') status?: unknown,
    @Query('overdue') overdue?: unknown,
    @Query('deadlineFrom') deadlineFrom?: unknown,
    @Query('deadlineTo') deadlineTo?: unknown,
    @Query('sort') sort?: unknown,
  ): Promise<ContentListResponse> {
    return this.contents.list(
      checkPaging(page, pageSize),
      new Date(),
      checkContentListQuery({
        tab,
        q,
        creator,
        type,
        status,
        overdue,
        deadlineFrom,
        deadlineTo,
        sort,
      }),
    );
  }
}
