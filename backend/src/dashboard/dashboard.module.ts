import { Module } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import {
  EXECUTIVE_DASHBOARD_REPOSITORY,
} from './executive-dashboard.repository.js';
import { ExecutiveDashboardController } from './executive-dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';
import { PrismaExecutiveDashboardRepository } from './prisma-executive-dashboard.repository.js';

@Module({
  imports: [PrismaModule],
  controllers: [ExecutiveDashboardController],
  providers: [
    DashboardService,
    AdminGuard,
    {
      provide: EXECUTIVE_DASHBOARD_REPOSITORY,
      useClass: PrismaExecutiveDashboardRepository,
    },
  ],
  exports: [DashboardService],
})
export class DashboardModule {}
