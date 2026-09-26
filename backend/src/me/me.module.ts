import { Module } from '@nestjs/common';
import { DevCreatorGuard } from '../auth/dev-creator.guard.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { MyContentsController } from './my-contents.controller.js';
import { MyContentsService } from './my-contents.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [MyContentsController],
  providers: [MyContentsService, DevCreatorGuard],
})
export class MeModule {}
