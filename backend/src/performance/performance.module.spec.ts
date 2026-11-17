import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { ManualPerformanceService } from './manual-performance.service.js';
import { PerformanceLinksService } from './performance-links.service.js';
import { PerformanceModule } from './performance.module.js';

describe('PerformanceModule', () => {
  it('builds both services the way the app does, with nothing but Prisma to give them', async () => {
    const module = await Test.createTestingModule({
      imports: [PerformanceModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    expect(module.get(ManualPerformanceService)).toBeInstanceOf(
      ManualPerformanceService,
    );
    expect(module.get(PerformanceLinksService)).toBeInstanceOf(
      PerformanceLinksService,
    );
  });
});
