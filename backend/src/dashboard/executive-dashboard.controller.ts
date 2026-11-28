import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard.js';
import { checkDashboardRange } from './dashboard-range.js';
import { DashboardService } from './dashboard.service.js';
import type { ExecutiveDashboard } from './dto/executive-dashboard.dto.js';

@Controller('admin/dashboard')
@UseGuards(AdminGuard)
export class ExecutiveDashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  list(@Query('range') range?: unknown): Promise<ExecutiveDashboard> {
    // One of 3, 6 or 12 months; the same check answers a bad query here and a direct call.
    return this.dashboard.executive(new Date(), checkDashboardRange(range));
  }
}
