import { Module } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard.js';
import { DevCreatorGuard } from '../auth/dev-creator.guard.js';
import { ManualPerformanceController } from './manual-performance.controller.js';
import { ManualPerformanceService } from './manual-performance.service.js';
import { MyPerformanceLinksController } from './my-performance-links.controller.js';
import { PerformanceLinksController } from './performance-links.controller.js';
import { PerformanceLinksService } from './performance-links.service.js';

// Content performance per video link (PBI-27, 27.1): an admin's manual numbers, the admin's
// Performa Konten list and each creator's own list.
@Module({
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
