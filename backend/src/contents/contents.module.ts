import { Logger, Module } from '@nestjs/common';
import { PerformanceSyncModule } from '../performance/sync/performance-sync.module.js';
import { PerformanceSyncService } from '../performance/sync/performance-sync.service.js';
import { LINKS_SAVED, syncInBackground } from './links-saved.js';
import { AdminGuard } from '../auth/admin.guard.js';
import { CreatorOrAdminGuard } from '../auth/creator-or-admin.guard.js';
import { DevCreatorGuard } from '../auth/dev-creator.guard.js';
import { ContentDetailService } from './content-detail.service.js';
import { ContentEditController } from './content-edit.controller.js';
import { ContentEditService } from './content-edit.service.js';
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
import { CLEARED_PERFORMANCE } from '../performance/link-performance.js';
import {
  LINK_PERFORMANCE_COLUMNS,
  LinkChangeService,
} from './link-change.service.js';
import { VideoSubmissionController } from './video-submission.controller.js';
import { VideoSubmissionService } from './video-submission.service.js';

@Module({
  // A saved link syncs its content in the background (PBI-27's sync, 27.4).
  imports: [PerformanceSyncModule],
  controllers: [
    ContentEditController,
    ContentLinksController,
    ContentListController,
    ContentsController,
    CreatorCommentController,
    DraftSubmissionController,
    VideoSubmissionController,
  ],
  providers: [
    ContentEditService,
    ContentCreationService,
    ContentDetailService,
    ContentEventHistoryService,
    ContentListService,
    CreatorCommentService,
    DraftSubmissionService,
    LinkChangeService,
    // A replaced link starts again with no numbers (PBI-38 AC 9, PBI-27).
    { provide: LINK_PERFORMANCE_COLUMNS, useValue: CLEARED_PERFORMANCE },
    {
      provide: LINKS_SAVED,
      useFactory: (sync: PerformanceSyncService) =>
        syncInBackground(sync, new Logger('LinkSync')),
      inject: [PerformanceSyncService],
    },
    VideoSubmissionService,
    AdminGuard,
    CreatorOrAdminGuard,
    DevCreatorGuard,
  ],
})
export class ContentsModule {}
