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
import { checkPerformanceLinksQuery } from './performance-links-query.js';
import {
  PerformanceLinksService,
  type PerformanceLinksPage,
} from './performance-links.service.js';

/**
 * The admin's Performa Konten list (PBI-27 AC 22-26): every submitted link with its numbers,
 * admins only (OWASP A01:2025). Paging and filters are checked here, before any query runs.
 */
@Controller('performance')
@UseGuards(AdminGuard)
export class PerformanceLinksController {
  constructor(
    @Inject(PerformanceLinksService)
    private readonly links: Pick<PerformanceLinksService, 'list'>,
  ) {}

  @Get('links')
  list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(DEFAULT_PAGE_SIZE), ParseIntPipe)
    pageSize: number,
    @Query('creator') creator?: unknown,
    @Query('platform') platform?: unknown,
  ): Promise<PerformanceLinksPage> {
    const paging = checkPaging(page, pageSize);
    return this.links.list(
      paging,
      checkPerformanceLinksQuery({ creator, platform }),
    );
  }
}
