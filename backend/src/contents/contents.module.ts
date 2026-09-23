import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ContentsController } from './contents.controller.js';
import { ContentsService } from './contents.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [ContentsController],
  providers: [ContentsService],
})
export class ContentsModule {}
