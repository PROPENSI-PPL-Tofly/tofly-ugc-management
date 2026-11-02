import type { INestApplication } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AdminGuard } from '../auth/admin.guard.js';
import { ManualPerformanceService } from './manual-performance.service.js';
import {
  ManualPerformanceController,
  PerformanceLinksController,
} from './performance.controller.js';
import { PerformanceLinksService } from './performance-links.service.js';

const CONTENT_ID = '7d0c5f1e-3b1a-4c2e-9f4d-2a6b8c0d1e2f';
const CREATOR_A = '0f9c2f5e-6b1a-4f3e-9a51-3c1d2e4b5a60';
const ADMIN_USER = '9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f';

describe('Performance routes', () => {
  const manual = { save: vi.fn() };
  const links = { list: vi.fn() };
  let app: INestApplication;
  // The local development stand-in for sign-in lets a request through with no principal.
  let principal: { userId: string; role: 'admin' } | undefined;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ManualPerformanceController, PerformanceLinksController],
      providers: [
        { provide: ManualPerformanceService, useValue: manual },
        { provide: PerformanceLinksService, useValue: links },
      ],
    })
      // AdminGuard has its own spec; here it lets an admin through and names them.
      .overrideGuard(AdminGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp(): { getRequest(): Record<string, unknown> };
        }) => {
          context.switchToHttp().getRequest().principal = principal;
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    principal = { userId: ADMIN_USER, role: 'admin' };
    manual.save.mockResolvedValue({ state: 'manual' });
    links.list.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 10,
      total: 0,
      totalPages: 1,
    });
  });

  it.each([ManualPerformanceController, PerformanceLinksController])(
    '%o is open to signed-in admins only, creators included out (AC 21, 26)',
    (controller) => {
      expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toEqual([
        AdminGuard,
      ]);
    },
  );

  describe('PUT /contents/:id/links/:platform/performance', () => {
    function put(path: string, body: unknown) {
      return request(app.getHttpServer())
        .put(path)
        .send(body as object);
    }

    it('saves the checked numbers for that platform, naming the signed-in admin', async () => {
      const response = await put(
        `/contents/${CONTENT_ID}/links/instagram/performance`,
        { views: '12400', likes: '' },
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ state: 'manual' });
      expect(manual.save).toHaveBeenCalledWith(
        CONTENT_ID,
        'instagram',
        { views: 12400, likes: null, comments: null, shares: null },
        ADMIN_USER,
        expect.any(Date),
      );
    });

    it('names no admin when the local stand-in let the request through', async () => {
      principal = undefined;

      await put(`/contents/${CONTENT_ID}/links/instagram/performance`, {
        views: 1,
      });

      expect(manual.save).toHaveBeenCalledWith(
        CONTENT_ID,
        'instagram',
        { views: 1, likes: null, comments: null, shares: null },
        null,
        expect.any(Date),
      );
    });

    it('answers 422 with an error per field, before the service is asked (AC 15)', async () => {
      const response = await put(
        `/contents/${CONTENT_ID}/links/tiktok/performance`,
        { views: 1_000_000_000, shares: 'x' },
      );

      expect(response.status).toBe(422);
      expect(response.body.errors).toEqual({
        views: 'Isi bilangan bulat 0 sampai 999.999.999',
        shares: 'Isi bilangan bulat 0 sampai 999.999.999',
      });
      expect(manual.save).not.toHaveBeenCalled();
    });

    it('answers 404 for a platform the app does not know', async () => {
      const response = await put(
        `/contents/${CONTENT_ID}/links/youtube/performance`,
        { views: 1 },
      );

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        code: 'PLATFORM_NOT_FOUND',
        message: 'Platform tidak dikenal',
      });
      expect(manual.save).not.toHaveBeenCalled();
    });

    it('answers 400 for a content id that is not one', async () => {
      const response = await put('/contents/abc/links/instagram/performance', {
        views: 1,
      });

      expect(response.status).toBe(400);
      expect(manual.save).not.toHaveBeenCalled();
    });
  });

  describe('GET /performance/links', () => {
    function get(query = '') {
      return request(app.getHttpServer()).get(`/performance/links${query}`);
    }

    it('lists 10 links per page by default (AC 23)', async () => {
      const response = await get();

      expect(response.status).toBe(200);
      expect(links.list).toHaveBeenCalledWith({ page: 1, pageSize: 10 }, {});
    });

    it('passes the checked filters and page on', async () => {
      await get(`?page=2&creator=${CREATOR_A}&platform=instagram`);

      expect(links.list).toHaveBeenCalledWith(
        { page: 2, pageSize: 10 },
        { creators: [CREATOR_A], platforms: ['instagram'] },
      );
    });

    it.each(['?page=0', '?page=x', '?platform=youtube', '?creator=rani'])(
      'answers 400 for %s',
      async (query) => {
        expect((await get(query)).status).toBe(400);
        expect(links.list).not.toHaveBeenCalled();
      },
    );
  });
});
