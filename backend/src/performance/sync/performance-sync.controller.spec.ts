import { ConflictException, type INestApplication } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AdminGuard } from '../../auth/admin.guard.js';
import {
  ContentPerformanceSyncController,
  InternalPerformanceSyncController,
} from './performance-sync.controller.js';
import { PerformanceSyncService } from './performance-sync.service.js';
import { SyncSecretGuard } from './sync-secret.guard.js';

const CONTENT_ID = '7d0c5f1e-3b1a-4c2e-9f4d-2a6b8c0d1e2f';

describe('Performance sync routes', () => {
  const sync = { syncAll: vi.fn(), syncContent: vi.fn() };
  const allow = { canActivate: () => true };
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [
        InternalPerformanceSyncController,
        ContentPerformanceSyncController,
      ],
      providers: [{ provide: PerformanceSyncService, useValue: sync }],
    })
      // Each guard has its own spec; here they let the request through.
      .overrideGuard(AdminGuard)
      .useValue(allow)
      .overrideGuard(SyncSecretGuard)
      .useValue(allow)
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens the scheduler route only to the secret header, never to a session (OWASP A07)', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, InternalPerformanceSyncController),
    ).toEqual([SyncSecretGuard]);
  });

  it('opens "Sinkronkan" to signed-in admins only, same-origin checked by AdminGuard (OWASP A01)', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ContentPerformanceSyncController),
    ).toEqual([AdminGuard]);
  });

  describe('POST /internal/performance-sync', () => {
    it('runs the daily sync and answers its counts with 200', async () => {
      const report = {
        processed: 4,
        succeeded: 3,
        failed: 1,
        skipped: 0,
        durationMs: 812,
      };
      sync.syncAll.mockResolvedValue(report);

      const response = await request(app.getHttpServer()).post(
        '/internal/performance-sync',
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual(report);
      expect(sync.syncAll).toHaveBeenCalledWith();
    });
  });

  describe('POST /contents/:id/performance-sync', () => {
    it('syncs that content and names the platforms it could not update (AC 12)', async () => {
      sync.syncContent.mockResolvedValue({
        notUpdated: [{ platform: 'tiktok' }],
      });

      const response = await request(app.getHttpServer()).post(
        `/contents/${CONTENT_ID}/performance-sync`,
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ notUpdated: [{ platform: 'tiktok' }] });
      expect(sync.syncContent).toHaveBeenCalledWith(CONTENT_ID);
    });

    it('passes the 409 on while that content is syncing (AC 13)', async () => {
      sync.syncContent.mockRejectedValue(
        new ConflictException({
          code: 'SYNC_RUNNING',
          message: 'Konten ini sedang disinkronkan',
        }),
      );

      const response = await request(app.getHttpServer()).post(
        `/contents/${CONTENT_ID}/performance-sync`,
      );

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        code: 'SYNC_RUNNING',
        message: 'Konten ini sedang disinkronkan',
      });
    });

    it('refuses an id that is not a uuid before any read (OWASP A05)', async () => {
      const response = await request(app.getHttpServer()).post(
        '/contents/not-a-uuid/performance-sync',
      );

      expect(response.status).toBe(400);
      expect(sync.syncContent).not.toHaveBeenCalled();
    });
  });

  // SCRUM-282: the Refresh button on one link card syncs only that card's link.
  describe('POST /contents/:id/links/:platform/performance-sync', () => {
    it("syncs only that platform's link of the content", async () => {
      sync.syncContent.mockResolvedValue({ notUpdated: [] });

      const response = await request(app.getHttpServer()).post(
        `/contents/${CONTENT_ID}/links/instagram/performance-sync`,
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ notUpdated: [] });
      expect(sync.syncContent).toHaveBeenCalledWith(CONTENT_ID, 'instagram');
    });

    it('passes the 409 on while that content is syncing (AC 13)', async () => {
      sync.syncContent.mockRejectedValue(
        new ConflictException({
          code: 'SYNC_RUNNING',
          message: 'Konten ini sedang disinkronkan',
        }),
      );

      const response = await request(app.getHttpServer()).post(
        `/contents/${CONTENT_ID}/links/tiktok/performance-sync`,
      );

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('SYNC_RUNNING');
    });

    // Negative, as the manual-entry route answers it: no read for a platform Tofly does not know.
    it('answers 404 for a platform Tofly does not know, before any read', async () => {
      const response = await request(app.getHttpServer()).post(
        `/contents/${CONTENT_ID}/links/youtube/performance-sync`,
      );

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        code: 'PLATFORM_NOT_FOUND',
        message: 'Platform tidak dikenal',
      });
      expect(sync.syncContent).not.toHaveBeenCalled();
    });

    it('refuses an id that is not a uuid before any read (OWASP A05)', async () => {
      const response = await request(app.getHttpServer()).post(
        '/contents/not-a-uuid/links/tiktok/performance-sync',
      );

      expect(response.status).toBe(400);
      expect(sync.syncContent).not.toHaveBeenCalled();
    });
  });
});
