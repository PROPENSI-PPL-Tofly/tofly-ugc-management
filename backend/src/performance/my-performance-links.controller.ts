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
import { checkPerformanceLinksQuery } from './performance-links.js';
import {
  PerformanceLinksService,
  type PerformanceLinksPage,
} from './performance-links.service.js';

/**
 * The creator's own links with their numbers, for their Performa page (PBI-27, AC 20). The same
 * list as the admin's "Performa Konten", read through the same service: only whose links it is
 * changes, and that is the creator the guard resolved. A creator named in the address is never
 * read (OWASP A01:2025), so no address reaches another creator's numbers.
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
    const { platforms } = checkPerformanceLinksQuery({ platform });
    return this.links.list(checkPaging(page, pageSize), {
      creators: [creatorId],
      ...(platforms && { platforms }),
    });
  }
}
