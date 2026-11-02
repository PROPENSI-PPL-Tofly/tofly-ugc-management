import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { InvoicesModule } from '../../invoices/invoices.module.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PerformanceModule } from '../performance.module.js';
import { CONTRACT_SYNC } from '../ports.js';
import {
  PERFORMANCE_SOURCES,
  PerformanceSyncService,
} from './performance-sync.service.js';
import { PerformanceSyncModule } from './performance-sync.module.js';
import { SYNC_SECRET, SyncSecretGuard } from './sync-secret.guard.js';

describe('PerformanceSyncModule', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function compile() {
    return Test.createTestingModule({ imports: [PerformanceSyncModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
  }

  it('builds the sync the way the app does, with nothing but Prisma and the environment', async () => {
    vi.stubEnv('SOCIAL_TOKEN_KEY', '');
    const module = await compile();

    expect(module.get(PerformanceSyncService)).toBeInstanceOf(
      PerformanceSyncService,
    );
    expect(module.get(PERFORMANCE_SOURCES)).toEqual([]);
    expect(module.get(SyncSecretGuard)).toBeInstanceOf(SyncSecretGuard);
  });

  it('hands Finalize the same sync through CONTRACT_SYNC, so its last sync is a real one (PBI-28)', async () => {
    const module = await compile();

    expect(module.get(CONTRACT_SYNC)).toBe(module.get(PerformanceSyncService));
  });

  it('reads the scheduler secret from PERFORMANCE_SYNC_SECRET', async () => {
    vi.stubEnv('PERFORMANCE_SYNC_SECRET', 'from-secret-manager');
    const module = await compile();

    expect(module.get(SYNC_SECRET)).toBe('from-secret-manager');
  });

  it('is part of the performance feature and of invoicing, where Finalize injects CONTRACT_SYNC', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, PerformanceModule),
    ).toContain(PerformanceSyncModule);
    expect(
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, InvoicesModule),
    ).toContain(PerformanceSyncModule);
    expect(
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, PerformanceSyncModule),
    ).toEqual([CONTRACT_SYNC]);
  });
});
