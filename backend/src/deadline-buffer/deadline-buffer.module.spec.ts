import { GLOBAL_MODULE_METADATA } from '@nestjs/common/constants.js';
import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module.js';
import { ContentCreationService } from '../contents/contents.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DeadlineBufferController } from './deadline-buffer.controller.js';
import { DeadlineBufferModule } from './deadline-buffer.module.js';
import {
  CONTENT_SCHEDULING,
  type ContentScheduling,
} from './deadline-scheduling.js';
import { DeadlineBufferService } from './deadline-buffer.service.js';

describe('DeadlineBufferModule (SCRUM-298)', () => {
  async function compiled() {
    return Test.createTestingModule({
      imports: [PrismaModule, DeadlineBufferModule],
      providers: [ContentCreationService],
    })
      .overrideProvider(PrismaService)
      .useValue({
        deadline_buffer: { findUnique: async () => ({ buffer_days: 9 }) },
      })
      .compile();
  }

  it('is global, so every deadline rule reads the buffer without an import', () => {
    expect(
      Reflect.getMetadata(GLOBAL_MODULE_METADATA, DeadlineBufferModule),
    ).toBe(true);
  });

  it('is part of the app', () => {
    expect(Reflect.getMetadata('imports', AppModule)).toContain(
      DeadlineBufferModule,
    );
  });

  it('serves the routes with the one DeadlineBufferService it holds', async () => {
    const module = await compiled();
    const controller = module.get(DeadlineBufferController) as unknown as {
      buffer: DeadlineBufferService;
    };

    expect(controller.buffer).toBe(module.get(DeadlineBufferService));
  });

  // Tambah Konten and content edit already take CONTENT_SCHEDULING; until now nothing provided
  // it, so they fell back to a constant 5.
  it('hands the services that schedule content the stored buffer and the clock', async () => {
    const module = await compiled();
    const scheduling = module.get<ContentScheduling>(CONTENT_SCHEDULING);
    const service = module.get(ContentCreationService) as unknown as {
      scheduling: ContentScheduling;
    };

    expect(service.scheduling).toBe(scheduling);
    expect(await scheduling.bufferDays()).toBe(9);
    expect(scheduling.today()).toBeInstanceOf(Date);
  });
});
