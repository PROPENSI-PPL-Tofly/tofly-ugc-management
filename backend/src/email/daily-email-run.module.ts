import { Module } from '@nestjs/common';
import { SYNC_SECRET, SyncSecretGuard } from '../performance/sync/sync-secret.guard.js';
import { InternalEmailRunController } from './daily-email-run.controller.js';
import { DailyEmailRun } from './daily-email-run.service.js';
import { EmailModule } from './email.module.js';

// The 08:00 WIB email run (PBI-11, 11.3): H-1 reminders and retries of failed emails. Its
// scheduler job sends the performance sync's secret, so no new secret is needed per environment.
@Module({
  imports: [EmailModule],
  controllers: [InternalEmailRunController],
  providers: [
    DailyEmailRun,
    SyncSecretGuard,
    {
      provide: SYNC_SECRET,
      useFactory: () => process.env.PERFORMANCE_SYNC_SECRET,
    },
  ],
})
export class DailyEmailRunModule {}
