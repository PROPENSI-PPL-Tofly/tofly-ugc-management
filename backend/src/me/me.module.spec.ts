import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MeModule } from './me.module.js';
import { MyContentsController } from './my-contents.controller.js';
import { MyContentsService } from './my-contents.service.js';

describe('MeModule', () => {
  it('provides the Task Saya controller and service', async () => {
    const module = await Test.createTestingModule({
      imports: [MeModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    expect(module.get(MyContentsController)).toBeDefined();
    expect(module.get(MyContentsService)).toBeDefined();
  });

  it('is part of the application', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      AppModule,
    ) as unknown[];

    expect(imports).toContain(MeModule);
  });
});
