import { Module } from '@nestjs/common';
import { DevCreatorGuard } from '../auth/dev-creator.guard.js';
import { CLOCK, systemClock } from '../common/clock.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { MeContentsController } from './me-contents.controller.js';
import { MyTaskService } from './my-task.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [MeContentsController],
  // TODO(PBI-9): replace DevCreatorGuard with real Google OAuth session once auth lands.
  providers: [
    MyTaskService,
    DevCreatorGuard,
    { provide: CLOCK, useValue: systemClock },
  ],
})
export class MyTaskModule {}
