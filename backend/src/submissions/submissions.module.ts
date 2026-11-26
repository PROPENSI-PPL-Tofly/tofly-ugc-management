import { Module } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard.js';
import { CreatorOrAdminGuard } from '../auth/creator-or-admin.guard.js';
import { DevCreatorGuard } from '../auth/dev-creator.guard.js';
import { CreatorEmails } from '../email/creator-emails.js';
import { CREATOR_NOTIFIER, type CreatorNotifier } from '../email/creator-notifier.js';
import { EmailModule } from '../email/email.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageModule } from '../storage/storage.module.js';
import { FollowUpController } from './follow-up.controller.js';
import { FollowUpService } from './follow-up.service.js';
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
  // Revision, follow-up and approval email the creator (PBI-11).
  imports: [PrismaModule, StorageModule, EmailModule],

  controllers: [
    SubmissionsController,
    SubmissionRevisionController,
    RevisionNoteImagesController,
    RevisionNoteImageController,
    FollowUpController,
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

    { provide: CREATOR_NOTIFIER, useExisting: CreatorEmails },

    {
      provide: SubmissionRevisionService,
      useFactory: (repository: SubmissionRevisionRepository, notifier: CreatorNotifier) =>
        new SubmissionRevisionService(repository, notifier),
      inject: [SubmissionRevisionRepository, CREATOR_NOTIFIER],
    },

    {
      provide: 'SubmissionRevisionService',
      useExisting: SubmissionRevisionService,
    },

    {
      provide: FollowUpService,
      useFactory: (prisma: PrismaService, notifier: CreatorNotifier) =>
        new FollowUpService(prisma, notifier),
      inject: [PrismaService, CREATOR_NOTIFIER],
    },

    {
      provide: 'FollowUpService',
      useExisting: FollowUpService,
    },
  ],
})
export class SubmissionsModule {}
