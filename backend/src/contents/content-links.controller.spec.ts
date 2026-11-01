import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CreatorOrAdminGuard } from '../auth/creator-or-admin.guard.js';
import { DevCreatorGuard } from '../auth/dev-creator.guard.js';
import { ContentLinksController } from './content-links.controller.js';
import { AdminLinkActor, CreatorLinkActor } from './link-change.js';
import { LinkChangeService } from './link-change.service.js';

const CONTENT_ID = '7d0c5f1e-3b1a-4c2e-9f4d-2a6b8c0d1e2f';
const CREATOR_ID = '0b5e2c9a-6f3d-4e1b-8a7c-9d2f4e6a8b1c';
const ADMIN_USER = '9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f';
const REEL = 'https://www.instagram.com/reel/C9xYz/';
const VIDEO = 'https://www.tiktok.com/@tofly/video/7312345678901234567';

const RESULT = {
  contentId: CONTENT_ID,
  status: 'link_submitted',
  submittedAt: '2026-10-10',
  links: [{ platform: 'instagram', url: REEL, submittedAt: '2026-10-10' }],
};

// The guards are proven on their own; here a test header says who the guard let in.
const AS = 'x-test-as';

interface TestRequest {
  headers: Record<string, string | undefined>;
  creatorId?: string;
  principal?: { userId: string; role: 'admin' };
}

function stubGuard(context: ExecutionContext): boolean {
  const req = context.switchToHttp().getRequest<TestRequest>();
  const as = req.headers[AS];
  if (as === 'creator') {
    req.creatorId = CREATOR_ID;
  } else if (as === 'admin') {
    req.principal = { userId: ADMIN_USER, role: 'admin' };
  }
  return as !== 'nobody';
}

describe('ContentLinksController', () => {
  const links = { submit: vi.fn(), replace: vi.fn() };
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ContentLinksController],
      providers: [{ provide: LinkChangeService, useValue: links }],
    })
      .overrideGuard(DevCreatorGuard)
      .useValue({ canActivate: stubGuard })
      .overrideGuard(CreatorOrAdminGuard)
      .useValue({ canActivate: stubGuard })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    links.submit.mockReset().mockResolvedValue(RESULT);
    links.replace.mockReset().mockResolvedValue(RESULT);
  });

  describe('POST /contents/:id/links', () => {
    function submit(body: unknown, id = CONTENT_ID) {
      return request(app.getHttpServer())
        .post(`/contents/${id}/links`)
        .set(AS, 'creator')
        .send(body as object);
    }

    it('hands the checked links to the service as the calling creator and answers 201', async () => {
      const response = await submit({
        links: { instagram: ` ${REEL} `, tiktok: VIDEO },
      });

      expect(response.status).toBe(201);
      expect(response.body).toEqual(RESULT);
      expect(links.submit).toHaveBeenCalledWith(
        CONTENT_ID,
        new CreatorLinkActor(CREATOR_ID),
        [
          { platform: 'instagram', url: REEL },
          { platform: 'tiktok', url: VIDEO },
        ],
      );
    });

    it('answers 422 per field before the service is asked', async () => {
      const response = await submit({ links: { instagram: VIDEO } });

      expect(response.status).toBe(422);
      expect(response.body.errors).toEqual({
        instagram:
          'Link harus dari Instagram (instagram.com/reel/... atau /p/...)',
      });
      expect(links.submit).not.toHaveBeenCalled();
    });

    it('answers 400 for an id that is not a uuid', async () => {
      const response = await submit(
        { links: { instagram: REEL } },
        'not-a-uuid',
      );

      expect(response.status).toBe(400);
      expect(links.submit).not.toHaveBeenCalled();
    });

    it('lets nobody in that the creator guard turns away', async () => {
      const response = await request(app.getHttpServer())
        .post(`/contents/${CONTENT_ID}/links`)
        .set(AS, 'nobody')
        .send({ links: { instagram: REEL } });

      expect(response.status).toBe(403);
      expect(links.submit).not.toHaveBeenCalled();
    });
  });

  describe('PUT /contents/:id/links/:platform', () => {
    function replace(as: string, platform: string, body: unknown) {
      return request(app.getHttpServer())
        .put(`/contents/${CONTENT_ID}/links/${platform}`)
        .set(AS, as)
        .send(body as object);
    }

    it('replaces as the calling creator when the creator guard let them in', async () => {
      const response = await replace('creator', 'tiktok', { url: VIDEO });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(RESULT);
      expect(links.replace).toHaveBeenCalledWith(
        CONTENT_ID,
        new CreatorLinkActor(CREATOR_ID),
        { platform: 'tiktok', url: VIDEO },
      );
    });

    it('replaces as the signed-in admin when the admin guard let them in', async () => {
      await replace('admin', 'instagram', { url: REEL });

      expect(links.replace).toHaveBeenCalledWith(
        CONTENT_ID,
        new AdminLinkActor(ADMIN_USER),
        { platform: 'instagram', url: REEL },
      );
    });

    it('replaces as an admin with no account under the local sign-in stand-in', async () => {
      await replace('local-admin', 'instagram', { url: REEL });

      expect(links.replace).toHaveBeenCalledWith(
        CONTENT_ID,
        new AdminLinkActor(null),
        { platform: 'instagram', url: REEL },
      );
    });

    it('answers 404 for a platform the app does not know', async () => {
      const response = await replace('admin', 'youtube', { url: REEL });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        code: 'PLATFORM_NOT_FOUND',
        message: 'Platform tidak dikenal',
      });
      expect(links.replace).not.toHaveBeenCalled();
    });

    it('answers 422 on the platform field for a link of the wrong kind', async () => {
      const response = await replace('creator', 'tiktok', { url: REEL });

      expect(response.status).toBe(422);
      expect(response.body.errors).toHaveProperty('tiktok');
    });
  });
});
