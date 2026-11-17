import type { INestApplication } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  DEV_CREATOR_HEADER,
  DevCreatorGuard,
} from '../auth/dev-creator.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  SESSION_EXPIRED_LOGIN,
  SocialConnectController,
} from './social-connect.controller.js';
import { SocialConnectService } from './social-connect.service.js';

const CREATOR = '5b0c8a4e-2f1d-4c3b-9a8e-7d6f5e4c3b2a';
const AUTHORIZE = 'https://www.tiktok.com/v2/auth/authorize/?state=signed';

describe('SocialConnectController', () => {
  // OWASP A01:2025: only a signed-in creator connects, and only their own account; an admin
  // or a visitor is turned away by the creator guard.
  it('is open to the signed-in creator only', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, SocialConnectController),
    ).toEqual([DevCreatorGuard]);
  });

  const connects = { start: vi.fn(), complete: vi.fn() };
  const prisma = { creators: { findUnique: vi.fn() } };
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SocialConnectController],
      providers: [
        { provide: SocialConnectService, useValue: connects },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('DEV_AUTH_ENABLED', 'true');
    vi.stubEnv('NODE_ENV', 'test');
    // A DEV_CREATOR_ID in a local .env would sign every request in; these tests name the
    // creator with the header alone.
    vi.stubEnv('DEV_CREATOR_ID', '');
    prisma.creators.findUnique.mockResolvedValue({ id: CREATOR });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const server = () => request(app.getHttpServer());

  describe('GET /social/:platform/connect', () => {
    it('redirects the creator to the platform, uncached', async () => {
      connects.start.mockResolvedValue(AUTHORIZE);

      const response = await server()
        .get('/social/tiktok/connect')
        .set(DEV_CREATOR_HEADER, CREATOR)
        .expect(302);

      expect(response.headers.location).toBe(AUTHORIZE);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(connects.start).toHaveBeenCalledWith(CREATOR, 'tiktok');
    });

    it('starts for the creator of the session, never one named in the request', async () => {
      connects.start.mockResolvedValue(AUTHORIZE);

      await server()
        .get(
          '/social/tiktok/connect?creatorId=0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d',
        )
        .set(DEV_CREATOR_HEADER, CREATOR)
        .expect(302);

      expect(connects.start).toHaveBeenCalledWith(CREATOR, 'tiktok');
    });

    // Review #127: these are page loads, so a JSON 401 would leave the creator on a bare
    // {"code":"UNAUTHENTICATED"}. The sign-in page says the session ended.
    it('sends a creator without a session to sign in again, uncached', async () => {
      const response = await server().get('/social/tiktok/connect').expect(302);

      expect(response.headers.location).toBe(SESSION_EXPIRED_LOGIN);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(connects.start).not.toHaveBeenCalled();
    });

    it('answers 404 for a platform PBI-19 does not connect', async () => {
      await server()
        .get('/social/facebook/connect')
        .set(DEV_CREATOR_HEADER, CREATOR)
        .expect(404);

      expect(connects.start).not.toHaveBeenCalled();
    });
  });

  describe('GET /social/:platform/callback', () => {
    it('finishes the connect with the callback query and lands where the service says, uncached', async () => {
      connects.complete.mockResolvedValue(
        '/creator/performance?connected=tiktok',
      );

      const response = await server()
        .get('/social/tiktok/callback?code=abc&state=signed&scopes=video.list')
        .set(DEV_CREATOR_HEADER, CREATOR)
        .expect(302);

      expect(response.headers.location).toBe(
        '/creator/performance?connected=tiktok',
      );
      expect(response.headers['cache-control']).toBe('no-store');
      expect(connects.complete).toHaveBeenCalledWith(CREATOR, 'tiktok', {
        code: 'abc',
        state: 'signed',
        scopes: 'video.list',
      });
    });

    // Review #127: a creator who stays on TikTok's consent screen until the session ends lands
    // on the sign-in page, then presses Hubungkan again. The code is never spent.
    it('sends a creator whose session ended on the platform to sign in again, spending no code', async () => {
      const response = await server()
        .get('/social/tiktok/callback?code=abc&state=s')
        .expect(302);

      expect(response.headers.location).toBe(SESSION_EXPIRED_LOGIN);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(connects.complete).not.toHaveBeenCalled();
    });

    it('answers 404 for a platform PBI-19 does not connect', async () => {
      await server()
        .get('/social/facebook/callback?code=abc&state=s')
        .set(DEV_CREATOR_HEADER, CREATOR)
        .expect(404);

      expect(connects.complete).not.toHaveBeenCalled();
    });
  });
});
