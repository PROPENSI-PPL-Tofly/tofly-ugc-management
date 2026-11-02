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
import { checkPaging, DEFAULT_PAGE_SIZE } from '../creators/paging.js';
import { checkPerformanceLinksQuery } from './performance-links-query.js';
import {
  PerformanceLinksService,
  type PerformanceLinksPage,
} from './performance-links.service.js';

/**
 * A creator's own links with their numbers, for their Performa page (PBI-27 AC 20). The same
 * list as the admin's Performa Konten, through the same service; only whose links changes, and
 * that is always the creator the guard resolved from the session. ?creator= is never read, so
 * no address reaches another creator's numbers (OWASP A01:2025).
 */
@Controller('me/performance')
@UseGuards(DevCreatorGuard)
export class MyPerformanceLinksController {
  constructor(
    @Inject(PerformanceLinksService)
    private readonly links: Pick<PerformanceLinksService, 'list'>,
  ) {}

  @Get('links')
  list(
    @CurrentCreator() creatorId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(DEFAULT_PAGE_SIZE), ParseIntPipe)
    pageSize: number,
    @Query('platform') platform?: unknown,
  ): Promise<PerformanceLinksPage> {
    const paging = checkPaging(page, pageSize);
    const { platforms } = checkPerformanceLinksQuery({ platform });
    return this.links.list(paging, { creators: [creatorId], platforms });
  }
}
