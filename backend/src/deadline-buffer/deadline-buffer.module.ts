import { Global, Module } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard.js';
import { CreatorOrAdminGuard } from '../auth/creator-or-admin.guard.js';
import { DevCreatorGuard } from '../auth/dev-creator.guard.js';
import { DeadlineBufferController } from './deadline-buffer.controller.js';
import { DeadlineBufferService } from './deadline-buffer.service.js';
import { CONTENT_SCHEDULING, schedulingFrom } from './deadline-scheduling.js';

/**
 * "Atur Buffer Deadline" (PBI-23, SCRUM-298). @Global, as AuditModule, so every deadline rule reads
 * the one stored buffer without an import.
 */
@Global()
@Module({
  controllers: [DeadlineBufferController],
  providers: [
    DeadlineBufferService,
    AdminGuard,
    DevCreatorGuard,
    CreatorOrAdminGuard,
    {
      provide: CONTENT_SCHEDULING,
      useFactory: schedulingFrom,
      inject: [DeadlineBufferService],
    },
  ],
  exports: [DeadlineBufferService, CONTENT_SCHEDULING],
})
export class DeadlineBufferModule {}
