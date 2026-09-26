import { Module } from '@nestjs/common';
import { ContentsController } from './contents.controller.js';
import { ContentCreationService } from './contents.service.js';
import { DraftSubmissionController } from './draft-submission.controller.js';
import { DraftSubmissionService } from './draft-submission.service.js';

@Module({
  controllers: [ContentsController, DraftSubmissionController],
  providers: [ContentCreationService, DraftSubmissionService],
})
export class ContentsModule {}
