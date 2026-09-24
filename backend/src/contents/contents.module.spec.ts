import { MODULE_METADATA } from '@nestjs/common/constants';
import { ContentsController } from './contents.controller.js';
import { ContentsModule } from './contents.module.js';
import { ContentCreationService } from './contents.service.js';

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
});