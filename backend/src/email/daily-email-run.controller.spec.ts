import type { INestApplication } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SyncSecretGuard } from '../performance/sync/sync-secret.guard.js';
import { InternalEmailRunController } from './daily-email-run.controller.js';
import { DailyEmailRun } from './daily-email-run.service.js';

describe('The 08:00 email run route', () => {
  const run = { run: vi.fn() };
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [InternalEmailRunController],
      providers: [{ provide: DailyEmailRun, useValue: run }],
    })
      // The guard has its own spec; here it lets the request through.
      .overrideGuard(SyncSecretGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // 11.3: like the performance sync, only Cloud Scheduler's secret header opens it (OWASP A07).
  it('opens only to the secret header, never to a session', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, InternalEmailRunController)).toEqual([
      SyncSecretGuard,
    ]);
  });

  it('runs the day and answers what it did', async () => {
    run.run.mockResolvedValue({ retried: 1, resent: 1, reminded: 4 });

    const response = await request(app.getHttpServer()).post('/internal/email-run');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ retried: 1, resent: 1, reminded: 4 });
    expect(run.run).toHaveBeenCalledOnce();
  });
});
