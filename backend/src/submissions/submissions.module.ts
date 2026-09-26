import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReviewQueueService } from './review-queue.service.js';
import { SubmissionDetailService } from './submission-detail.service.js';
import { SubmissionRevisionController } from './submission-revision.controller.js';
import { SubmissionRevisionRepository } from './submission-revision.repository.js';
import { SubmissionRevisionService } from './submission-revision.service.js';
import { SubmissionReviewService } from './submission-review.service.js';
import { SubmissionsController } from './submissions.controller.js';

@Module({
  imports: [PrismaModule],

  controllers: [SubmissionsController, SubmissionRevisionController],

  providers: [
    SubmissionReviewService,
    SubmissionDetailService,
    ReviewQueueService,

    {
      provide: SubmissionRevisionRepository,
      useFactory: (prisma: PrismaService) =>
        new SubmissionRevisionRepository(prisma),
      inject: [PrismaService],
    },

    {
      provide: SubmissionRevisionService,
      useFactory: (repository: SubmissionRevisionRepository) =>
        new SubmissionRevisionService(repository),
      inject: [SubmissionRevisionRepository],
    },

    {
      provide: 'SubmissionRevisionService',
      useExisting: SubmissionRevisionService,
    },
  ],
})
export class SubmissionsModule {}