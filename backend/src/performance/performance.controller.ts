import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard, type AdminRequest } from '../auth/admin.guard.js';
import { isSocialPlatform } from '../contents/link-rules.js';
import { checkPaging, DEFAULT_PAGE_SIZE } from '../creators/paging.js';
import {
  checkManualPerformance,
  type LinkPerformance,
} from './link-performance.js';
import { ManualPerformanceService } from './manual-performance.service.js';
import { checkPerformanceLinksQuery } from './performance-links.js';
import {
  PerformanceLinksService,
  type PerformanceLinksPage,
} from './performance-links.service.js';

/**
 * An admin types a link's numbers in when the platform cannot give them (PBI-27, AC 14-18). Only
 * an admin: a creator never edits the numbers their bonus is measured on (OWASP A01).
 */
@Controller('contents')
@UseGuards(AdminGuard)
export class ManualPerformanceController {
  constructor(
    @Inject(ManualPerformanceService)
    private readonly manual: Pick<ManualPerformanceService, 'save'>,
  ) {}

  @Put(':id/links/:platform/performance')
  save(
    @Param('id', new ParseUUIDPipe()) contentId: string,
    @Param('platform') platform: string,
    @Body() body: unknown,
    @Req() request: AdminRequest,
  ): Promise<LinkPerformance> {
    if (!isSocialPlatform(platform)) {
      throw new NotFoundException({
        code: 'PLATFORM_NOT_FOUND',
        message: 'Platform tidak dikenal',
      });
    }
    return this.manual.save(
      contentId,
      platform,
      checkManualPerformance(body),
      request.principal?.userId ?? null,
      new Date(),
    );
  }
}

/** The admin's "Performa Konten" page (PBI-27, AC 22-26): every creator's links, admin only. */
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
    return this.links.list(
      checkPaging(page, pageSize),
      checkPerformanceLinksQuery({ creator, platform }),
    );
  }
}
