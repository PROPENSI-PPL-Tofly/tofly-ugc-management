import { Module } from '@nestjs/common';
import { ContentsController } from './contents.controller.js';
import { ContentCreationService } from './contents.service.js';
import { VideoSubmissionController } from './video-submission.controller.js';
import { VideoSubmissionService } from './video-submission.service.js';

@Module({
  controllers: [ContentsController, VideoSubmissionController],
  providers: [ContentCreationService, VideoSubmissionService],
})
export class ContentsModule {}
