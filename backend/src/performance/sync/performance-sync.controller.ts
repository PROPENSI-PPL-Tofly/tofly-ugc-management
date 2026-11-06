import {
  Controller,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { social_platform } from '@prisma/client';
import { AdminGuard } from '../../auth/admin.guard.js';
import {
  PerformanceSyncService,
  type SyncRunReport,
} from './performance-sync.service.js';
import { SyncSecretGuard } from './sync-secret.guard.js';

/**
 * The daily 02:00 WIB run (PBI-27, AC 4-6), started by Cloud Scheduler with the secret header.
 * No session reaches it, and the frontend proxy does not forward /internal (OWASP A01, A07).
 */
@Controller('internal')
@UseGuards(SyncSecretGuard)
export class InternalPerformanceSyncController {
  constructor(
    @Inject(PerformanceSyncService)
    private readonly sync: Pick<PerformanceSyncService, 'syncAll'>,
  ) {}

  @Post('performance-sync')
  @HttpCode(200)
  run(): Promise<SyncRunReport> {
    return this.sync.syncAll();
  }
}

/** "Sinkronkan Sekarang" on Content Detail and "Sinkronkan" on Performa Konten (AC 12-13). */
@Controller('contents')
@UseGuards(AdminGuard)
export class ContentPerformanceSyncController {
  constructor(
    @Inject(PerformanceSyncService)
    private readonly sync: Pick<PerformanceSyncService, 'syncContent'>,
  ) {}

  @Post(':id/performance-sync')
  @HttpCode(200)
  syncContent(
    @Param('id', new ParseUUIDPipe()) contentId: string,
  ): Promise<{ notUpdated: { platform: social_platform }[] }> {
    return this.sync.syncContent(contentId);
  }
}
