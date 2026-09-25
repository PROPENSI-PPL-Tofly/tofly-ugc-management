import { MODULE_METADATA } from '@nestjs/common/constants';
import { AppModule } from '../app.module.js';
import { ReviewQueueService } from './review-queue.service.js';
import { SubmissionDetailService } from './submission-detail.service.js';
import { SubmissionReviewService } from './submission-review.service.js';
import { SubmissionsController } from './submissions.controller.js';
import { SubmissionsModule } from './submissions.module.js';

describe('SubmissionsModule', () => {
  it('registers the submissions controller and submission services', () => {
    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      SubmissionsModule,
    ) as unknown[];

    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      SubmissionsModule,
    ) as unknown[];

    expect(controllers).toContain(SubmissionsController);
    expect(providers).toContain(SubmissionReviewService);
    expect(providers).toContain(SubmissionDetailService);
    expect(providers).toContain(ReviewQueueService);
  });

  it('is part of the application', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      AppModule,
    ) as unknown[];

    expect(imports).toContain(SubmissionsModule);
  });
});
