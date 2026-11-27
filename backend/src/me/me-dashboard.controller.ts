import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentCreator } from '../auth/current-creator.decorator.js';
import { DevCreatorGuard } from '../auth/dev-creator.guard.js';
import type { CreatorDashboardCard } from './dto/me-dashboard.dto.js';
import { MeDashboardService } from './me-dashboard.service.js';

@Controller('me/dashboard')
@UseGuards(DevCreatorGuard)
export class MeDashboardController {
  constructor(private readonly dashboard: MeDashboardService) {}

  @Get()
  list(@CurrentCreator() creatorId: string): Promise<CreatorDashboardCard> {
    return this.dashboard.dashboard(creatorId);
  }
}
