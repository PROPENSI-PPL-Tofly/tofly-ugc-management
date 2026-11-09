import { Module } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard.js';
import { CreatorOrAdminGuard } from '../auth/creator-or-admin.guard.js';
import { DevCreatorGuard } from '../auth/dev-creator.guard.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageModule } from '../storage/storage.module.js';
import { ReviewQueueService } from './review-queue.service.js';
import { SubmissionDetailService } from './submission-detail.service.js';
import { SubmissionRevisionController } from './submission-revision.controller.js';
import { SubmissionRevisionRepository } from './submission-revision.repository.js';
import { SubmissionRevisionService } from './submission-revision.service.js';
import { SubmissionReviewService } from './submission-review.service.js';
import { SubmissionsController } from './submissions.controller.js';
import {
  RevisionNoteImageController,
  RevisionNoteImagesController,
} from './revision-note-images.controller.js';
import { RevisionNoteImagesService } from './revision-note-images.service.js';

@Module({
  imports: [PrismaModule, StorageModule],

  controllers: [
    SubmissionsController,
    SubmissionRevisionController,
    RevisionNoteImagesController,
    RevisionNoteImageController,
  ],

  providers: [
    SubmissionReviewService,
    SubmissionDetailService,
    ReviewQueueService,
    RevisionNoteImagesService,
    AdminGuard,
    CreatorOrAdminGuard,
    DevCreatorGuard,

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