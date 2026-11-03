import { Module } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ManualPerformanceService } from './manual-performance.service.js';
import {
  ManualPerformanceController,
  PerformanceLinksController,
} from './performance.controller.js';
import { PerformanceLinksService } from './performance-links.service.js';
import { PerformanceSyncModule } from './sync/performance-sync.module.js';

// Content performance (PBI-27): the numbers per link, typed in by an admin or listed for them.
// The platform adapters (27.2, 27.3) and the sync (27.4) join this module.
@Module({
  imports: [PrismaModule, PerformanceSyncModule],
  controllers: [ManualPerformanceController, PerformanceLinksController],
  providers: [ManualPerformanceService, PerformanceLinksService, AdminGuard],
})
export class PerformanceModule {}
