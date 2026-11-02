import { Module } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard.js';
import { ManualPerformanceController } from './manual-performance.controller.js';
import { ManualPerformanceService } from './manual-performance.service.js';

// Content performance per video link (PBI-27, 27.1): an admin's manual numbers.
@Module({
  controllers: [ManualPerformanceController],
  providers: [ManualPerformanceService, AdminGuard],
})
export class PerformanceModule {}
