import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AdminGuard } from '../auth/admin.guard.js';
import { ManualPerformanceController } from './manual-performance.controller.js';
import { ManualPerformanceService } from './manual-performance.service.js';

const CONTENT_ID = '7d0c5f1e-3b1a-4c2e-9f4d-2a6b8c0d1e2f';
const ADMIN_USER = '9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f';
const PERFORMANCE = {
  views: 12400,
  likes: null,
  comments: 0,
  shares: null,
  state: 'manual',
  lastSyncedAt: null,
  manualAt: '2026-11-04T03:15:00.000Z',
};

// AdminGuard is proven on its own; here a test header says whether the guard let an admin in.
const AS = 'x-test-as';

function stubGuard(context: ExecutionContext): boolean {
  const req = context
    .switchToHttp()
    .getRequest<{ headers: Record<string, string>; principal?: unknown }>();
  if (req.headers[AS] === 'admin') {
    req.principal = { userId: ADMIN_USER, role: 'admin' };
  }
  return req.headers[AS] !== 'nobody';
}

describe('ManualPerformanceController', () => {
  const performance = { enter: vi.fn() };
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ManualPerformanceController],
      providers: [{ provide: ManualPerformanceService, useValue: performance }],
    })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: stubGuard })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    performance.enter.mockReset().mockResolvedValue(PERFORMANCE);
  });

  function put(
    body: unknown,
    path = `/contents/${CONTENT_ID}/links/tiktok/performance`,
  ) {
    return request(app.getHttpServer())
      .put(path)
      .set(AS, 'admin')
      .send(body as object);
  }

  it('is guarded for admins only, on the whole controller', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ManualPerformanceController),
    ).toEqual([AdminGuard]);
  });

  it("hands the checked numbers to the service as the signed-in admin, with the server's own time, and answers 200", async () => {
    const before = Date.now();

    const response = await put({
      views: 12400,
      likes: '',
      comments: 0,
      manual_by: 'someone-else',
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(PERFORMANCE);
    expect(performance.enter).toHaveBeenCalledWith(
      CONTENT_ID,
      'tiktok',
      { views: 12400, likes: null, comments: 0, shares: null },
      ADMIN_USER,
      expect.any(Date),
    );
    const [, , , , now] = performance.enter.mock.calls[0] as [
      unknown,
      unknown,
      unknown,
      unknown,
      Date,
    ];
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('passes no admin on when the guard let the request in without one', async () => {
    await request(app.getHttpServer())
      .put(`/contents/${CONTENT_ID}/links/instagram/performance`)
      .send({ views: 1 });

    expect(performance.enter).toHaveBeenCalledWith(
      CONTENT_ID,
      'instagram',
      expect.anything(),
      null,
      expect.any(Date),
    );
  });

  it('answers 422 with the field errors and never reaches the service', async () => {
    const response = await put({ views: -1 });

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({
      errors: { views: 'Isi bilangan bulat 0 sampai 999.999.999' },
    });
    expect(performance.enter).not.toHaveBeenCalled();
  });

  it('answers 400 for an id that is not a UUID', async () => {
    const response = await put(
      { views: 1 },
      '/contents/abc/links/tiktok/performance',
    );

    expect(response.status).toBe(400);
    expect(performance.enter).not.toHaveBeenCalled();
  });

  it('answers 404 PLATFORM_NOT_FOUND for a platform the app does not know', async () => {
    const response = await put(
      { views: 1 },
      `/contents/${CONTENT_ID}/links/youtube/performance`,
    );

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: 'PLATFORM_NOT_FOUND' });
    expect(performance.enter).not.toHaveBeenCalled();
  });

  it('refuses a request the guard turns away', async () => {
    const response = await request(app.getHttpServer())
      .put(`/contents/${CONTENT_ID}/links/tiktok/performance`)
      .set(AS, 'nobody')
      .send({ views: 1 });

    expect(response.status).toBe(403);
    expect(performance.enter).not.toHaveBeenCalled();
  });
});
