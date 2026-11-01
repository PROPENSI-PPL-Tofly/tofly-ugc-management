import { MODULE_METADATA } from '@nestjs/common/constants';
import { AdminGuard } from '../auth/admin.guard.js';
import { CreatorOrAdminGuard } from '../auth/creator-or-admin.guard.js';
import { ContentLinksController } from './content-links.controller.js';
import { ContentListController } from './content-list.controller.js';
import { ContentListService } from './content-list.service.js';
import { ContentsController } from './contents.controller.js';
import { ContentsModule } from './contents.module.js';
import { ContentCreationService } from './contents.service.js';
import { DraftSubmissionController } from './draft-submission.controller.js';
import { DraftSubmissionService } from './draft-submission.service.js';
import { LinkChangeService } from './link-change.service.js';

describe('ContentsModule', () => {
  it('registers the contents controller and creation service', () => {
    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      ContentsModule,
    ) as unknown[];

    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      ContentsModule,
    ) as unknown[];

    expect(controllers).toContain(ContentsController);
    expect(providers).toContain(ContentCreationService);
  });

  it('registers the draft hand-in controller and service', () => {
    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      ContentsModule,
    ) as unknown[];

    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      ContentsModule,
    ) as unknown[];

    expect(controllers).toContain(DraftSubmissionController);
    expect(providers).toContain(DraftSubmissionService);
  });

  it('registers the Content Plan list controller and service', () => {
    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      ContentsModule,
    ) as unknown[];

    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      ContentsModule,
    ) as unknown[];

    expect(controllers).toContain(ContentListController);
    expect(providers).toContain(ContentListService);
  });

  it('registers the video link controller, its service and both guards its replace route asks', () => {
    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      ContentsModule,
    ) as unknown[];

    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      ContentsModule,
    ) as unknown[];

    expect(controllers).toContain(ContentLinksController);
    expect(providers).toEqual(
      expect.arrayContaining([
        LinkChangeService,
        CreatorOrAdminGuard,
        AdminGuard,
      ]),
    );
  });
});
