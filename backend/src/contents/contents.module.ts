import { Module } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard.js';
import { CreatorOrAdminGuard } from '../auth/creator-or-admin.guard.js';
import { DevCreatorGuard } from '../auth/dev-creator.guard.js';
import { ContentDetailService } from './content-detail.service.js';
import { ContentEventHistoryService } from './content-event-history.service.js';
import { ContentLinksController } from './content-links.controller.js';
import { ContentListController } from './content-list.controller.js';
import { ContentListService } from './content-list.service.js';
import { CreatorCommentController } from './creator-comment.controller.js';
import { CreatorCommentService } from './creator-comment.service.js';
import { ContentsController } from './contents.controller.js';
import { ContentCreationService } from './contents.service.js';
import { DraftSubmissionController } from './draft-submission.controller.js';
import { DraftSubmissionService } from './draft-submission.service.js';
import { LinkChangeService } from './link-change.service.js';
import { VideoSubmissionController } from './video-submission.controller.js';
import { VideoSubmissionService } from './video-submission.service.js';

@Module({
  controllers: [
    ContentLinksController,
    ContentListController,
    ContentsController,
    CreatorCommentController,
    DraftSubmissionController,
    VideoSubmissionController,
  ],
  providers: [
    ContentCreationService,
    ContentDetailService,
    ContentEventHistoryService,
    ContentListService,
    CreatorCommentService,
    DraftSubmissionService,
    LinkChangeService,
    VideoSubmissionService,
    AdminGuard,
    CreatorOrAdminGuard,
    DevCreatorGuard,
  ],
})
export class ContentsModule {}
