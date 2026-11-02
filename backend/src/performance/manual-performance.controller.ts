import {
  Body,
  Controller,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard, type AdminRequest } from '../auth/admin.guard.js';
import { isSocialPlatform } from '../contents/link-rules.js';
import type { LinkPerformance } from './link-performance.mapper.js';
import { checkManualPerformance } from './manual-performance-input.js';
import { ManualPerformanceService } from './manual-performance.service.js';

/**
 * An admin types a video link's performance numbers in (PBI-27 27.1, AC 14-16, 18): admins only
 * (OWASP A01:2025). Who and when come from the session and the server, never the body.
 */
@Controller('contents')
@UseGuards(AdminGuard)
export class ManualPerformanceController {
  constructor(
    @Inject(ManualPerformanceService)
    private readonly performance: Pick<ManualPerformanceService, 'enter'>,
  ) {}

  @Put(':id/links/:platform/performance')
  enter(
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
    return this.performance.enter(
      contentId,
      platform,
      checkManualPerformance(body),
      request.principal?.userId ?? null,
      new Date(),
    );
  }
}
