import { Module } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard.js';
import { DevCreatorGuard } from '../auth/dev-creator.guard.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ManualPerformanceService } from './manual-performance.service.js';
import { MyPerformanceLinksController } from './my-performance-links.controller.js';
import {
  ManualPerformanceController,
  PerformanceLinksController,
} from './performance.controller.js';
import { PerformanceLinksService } from './performance-links.service.js';
import { PerformanceSyncModule } from './sync/performance-sync.module.js';

// Content performance (PBI-27): the numbers per link, typed in by an admin, listed for them, and
// listed for each creator on their own Performa page.
// The platform adapters (27.2, 27.3) and the sync (27.4) join this module.
@Module({
  imports: [PrismaModule, PerformanceSyncModule],
  controllers: [
    ManualPerformanceController,
    PerformanceLinksController,
    MyPerformanceLinksController,
  ],
  providers: [
    ManualPerformanceService,
    PerformanceLinksService,
    AdminGuard,
    DevCreatorGuard,
  ],
})
export class PerformanceModule {}
