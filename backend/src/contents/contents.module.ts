import { Module } from '@nestjs/common';
import { DevCreatorGuard } from '../auth/dev-creator.guard.js';
import { ContentsController } from './contents.controller.js';
import { ContentCreationService } from './contents.service.js';
import { DraftSubmissionController } from './draft-submission.controller.js';
import { DraftSubmissionService } from './draft-submission.service.js';
import { VideoSubmissionController } from './video-submission.controller.js';
import { VideoSubmissionService } from './video-submission.service.js';

@Module({
  controllers: [
    ContentsController,
    DraftSubmissionController,
    VideoSubmissionController,
  ],
  providers: [
    ContentCreationService,
    DraftSubmissionService,
    VideoSubmissionService,
    DevCreatorGuard,
  ],
})
export class ContentsModule {}
