import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../../auth/admin.guard.js';
import { checkLinkIds } from './link-ids.js';
import {
  PerformanceSyncService,
  type PageSyncReport,
} from './performance-sync.service.js';

/**
 * "Sinkronkan Sekarang" on "Performa Konten" (SCRUM-285): the links on the page the admin is
 * looking at, as filtered, and no others. Admins only, same-origin checked by AdminGuard (OWASP A01).
 */
@Controller('performance')
@UseGuards(AdminGuard)
export class PerformanceLinksSyncController {
  constructor(
    @Inject(PerformanceSyncService)
    private readonly sync: Pick<PerformanceSyncService, 'syncLinks'>,
  ) {}

  @Post('links/sync')
  @HttpCode(200)
  syncPage(@Body() body: unknown): Promise<PageSyncReport> {
    return this.sync.syncLinks(checkLinkIds(body));
  }
}
