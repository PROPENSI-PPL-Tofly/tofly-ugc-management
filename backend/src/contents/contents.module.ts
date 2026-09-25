import { Module } from '@nestjs/common';
import { ContentsController } from './contents.controller.js';
import { ContentCreationService } from './contents.service.js';

@Module({
  controllers: [ContentsController],
  providers: [ContentCreationService],
})
export class ContentsModule {}