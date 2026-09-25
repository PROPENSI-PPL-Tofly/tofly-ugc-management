import { MODULE_METADATA } from '@nestjs/common/constants';
import { AppModule } from './app.module.js';
import { SubmissionsModule } from './submissions/submissions.module.js';

describe('AppModule', () => {
  it('imports the submissions module', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      AppModule,
    );

    expect(imports).toContain(SubmissionsModule);
  });
});