import { Module } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard.js';
import { ManualPerformanceController } from './manual-performance.controller.js';
import { ManualPerformanceService } from './manual-performance.service.js';
import { PerformanceLinksController } from './performance-links.controller.js';
import { PerformanceLinksService } from './performance-links.service.js';

// Content performance per video link (PBI-27, 27.1): an admin's manual numbers and the
// Performa Konten list.
@Module({
  controllers: [ManualPerformanceController, PerformanceLinksController],
  providers: [ManualPerformanceService, PerformanceLinksService, AdminGuard],
})
export class PerformanceModule {}
