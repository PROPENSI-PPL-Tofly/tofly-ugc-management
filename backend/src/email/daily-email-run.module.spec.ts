import { MODULE_METADATA } from '@nestjs/common/constants';
import { SYNC_SECRET, SyncSecretGuard } from '../performance/sync/sync-secret.guard.js';
import { InternalEmailRunController } from './daily-email-run.controller.js';
import { DailyEmailRunModule } from './daily-email-run.module.js';
import { DailyEmailRun } from './daily-email-run.service.js';
import { EmailModule } from './email.module.js';

describe('DailyEmailRunModule', () => {
  function metadata<T>(key: string): T {
    return Reflect.getMetadata(key, DailyEmailRunModule) as T;
  }

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('serves the 08:00 route with the run, on the email helper', () => {
    expect(metadata<unknown[]>(MODULE_METADATA.IMPORTS)).toContain(EmailModule);
    expect(metadata<unknown[]>(MODULE_METADATA.CONTROLLERS)).toEqual([InternalEmailRunController]);
    expect(metadata<unknown[]>(MODULE_METADATA.PROVIDERS)).toEqual(
      expect.arrayContaining([DailyEmailRun, SyncSecretGuard]),
    );
  });

  // The same secret the performance sync's scheduler job already sends, so no new secret.
  it('guards it with the performance sync secret', () => {
    vi.stubEnv('PERFORMANCE_SYNC_SECRET', 'secret-from-secret-manager');
    const providers = metadata<{ provide?: unknown; useFactory?: () => unknown }[]>(
      MODULE_METADATA.PROVIDERS,
    );

    const secret = providers.find((provider) => provider.provide === SYNC_SECRET);

    expect(secret?.useFactory?.()).toBe('secret-from-secret-manager');
  });
});
