import { MODULE_METADATA } from '@nestjs/common/constants';
import { AdminGuard } from '../auth/admin.guard.js';
import { CreatorOrAdminGuard } from '../auth/creator-or-admin.guard.js';
import { ContentEditController } from './content-edit.controller.js';
import { ContentEditService } from './content-edit.service.js';
import { ContentLinksController } from './content-links.controller.js';
import { ContentListController } from './content-list.controller.js';
import { ContentListService } from './content-list.service.js';
import { ContentsController } from './contents.controller.js';
import { ContentsModule } from './contents.module.js';
import { ContentCreationService } from './contents.service.js';
import { DraftSubmissionController } from './draft-submission.controller.js';
import { DraftSubmissionService } from './draft-submission.service.js';
import { CLEARED_PERFORMANCE } from '../performance/link-performance.js';
import { PerformanceSyncModule } from '../performance/sync/performance-sync.module.js';
import { LINKS_SAVED } from './links-saved.js';
import {
  LINK_PERFORMANCE_COLUMNS,
  LinkChangeService,
} from './link-change.service.js';

describe('ContentsModule', () => {
  // A saved link syncs its content in the background, through 27.4's service.
  it('imports the performance sync and hands link changes a listener for saved links', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, ContentsModule) as unknown[];
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      ContentsModule,
    ) as { provide?: unknown }[];

    expect(imports).toContain(PerformanceSyncModule);
    expect(providers.some((provider) => provider.provide === LINKS_SAVED)).toBe(true);
  });

  it('registers the edit and delete controller and service (PBI-25)', () => {
    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      ContentsModule,
    ) as unknown[];
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      ContentsModule,
    ) as unknown[];

    expect(controllers).toContain(ContentEditController);
    expect(providers).toContain(ContentEditService);
  });

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

  it("clears a replaced link's numbers and state with the columns PBI-27 added (PBI-38 AC 9)", () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      ContentsModule,
    ) as unknown[];

    expect(providers).toContainEqual({
      provide: LINK_PERFORMANCE_COLUMNS,
      useValue: CLEARED_PERFORMANCE,
    });
  });
});
