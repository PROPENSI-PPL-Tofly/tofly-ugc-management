import { Controller, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';
import { SyncSecretGuard } from '../performance/sync/sync-secret.guard.js';
import { DailyEmailRun, type DailyEmailReport } from './daily-email-run.service.js';

/**
 * The daily 08:00 WIB email run (PBI-11, 11.3), started by Cloud Scheduler with the secret header,
 * like the performance sync. No session reaches it, and the frontend proxy does not forward
 * /internal (OWASP A01, A07).
 */
@Controller('internal')
@UseGuards(SyncSecretGuard)
export class InternalEmailRunController {
  constructor(@Inject(DailyEmailRun) private readonly emails: Pick<DailyEmailRun, 'run'>) {}

  @Post('email-run')
  @HttpCode(200)
  run(): Promise<DailyEmailReport> {
    return this.emails.run();
  }
}
