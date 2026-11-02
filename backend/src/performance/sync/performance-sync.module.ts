import { Module } from '@nestjs/common';
import { AdminGuard } from '../../auth/admin.guard.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CONTRACT_SYNC } from '../ports.js';
import {
  ContentPerformanceSyncController,
  InternalPerformanceSyncController,
} from './performance-sync.controller.js';
import {
  PERFORMANCE_SOURCES,
  PerformanceSyncService,
} from './performance-sync.service.js';
import { SYNC_SECRET, SyncSecretGuard } from './sync-secret.guard.js';
import { syncSources } from './sync-sources.js';

// Syncing performance numbers (PBI-27, 27.4): the Cloud Scheduler run, "Sinkronkan" and
// Finalize's last sync (PBI-28), which reaches it through CONTRACT_SYNC alone.
@Module({
  imports: [PrismaModule],
  controllers: [
    InternalPerformanceSyncController,
    ContentPerformanceSyncController,
  ],
  providers: [
    AdminGuard,
    SyncSecretGuard,
    {
      provide: SYNC_SECRET,
      useFactory: () => process.env.PERFORMANCE_SYNC_SECRET,
    },
    {
      provide: PERFORMANCE_SOURCES,
      useFactory: (prisma: PrismaService) => syncSources(process.env, prisma),
      inject: [PrismaService],
    },
    PerformanceSyncService,
    { provide: CONTRACT_SYNC, useExisting: PerformanceSyncService },
  ],
  exports: [CONTRACT_SYNC],
})
export class PerformanceSyncModule {}
