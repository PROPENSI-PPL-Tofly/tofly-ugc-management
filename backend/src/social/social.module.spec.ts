import { Logger } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../app.module.js';
import { DEV_CREATOR_HEADER } from '../auth/dev-creator.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  INSTAGRAM_CONFIG,
  INSTAGRAM_CONNECT,
  INSTAGRAM_LOG,
  InstagramConnectController,
} from './instagram/instagram-connect.controller.js';
import { InstagramConnectService } from './instagram/instagram-connect.service.js';
import { SOCIAL_ACCOUNT_STORE, type SocialAccountStore } from './ports.js';
import { SocialModule } from './social.module.js';

const SETTINGS = {
  INSTAGRAM_APP_ID: '1234567890',
  INSTAGRAM_APP_SECRET: 'app-secret-xyz',
  INSTAGRAM_REDIRECT_URI: 'http://localhost:3000/api/social/instagram/callback',
  SOCIAL_STATE_SECRET: 'state-secret-of-at-least-32-chars!!',
};

function stubSettings(values: Record<string, string>) {
  for (const [name, value] of Object.entries(values)) {
    vi.stubEnv(name, value);
  }
}

async function compile() {
  return Test.createTestingModule({ imports: [SocialModule] }).compile();
}

describe('SocialModule', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('wires the Instagram controller, its connect use case and a logger', async () => {
    const module = await compile();

    expect(module.get(InstagramConnectController)).toBeInstanceOf(
      InstagramConnectController,
    );
    expect(module.get(INSTAGRAM_CONNECT)).toBeInstanceOf(
      InstagramConnectService,
    );
    expect(module.get(INSTAGRAM_LOG)).toBeInstanceOf(Logger);
  });

  it('reads the Instagram app from the environment once every setting is there', async () => {
    stubSettings(SETTINGS);

    const module = await compile();

    expect(module.get(INSTAGRAM_CONFIG)).toEqual({
      appId: SETTINGS.INSTAGRAM_APP_ID,
      appSecret: SETTINGS.INSTAGRAM_APP_SECRET,
      redirectUri: SETTINGS.INSTAGRAM_REDIRECT_URI,
      stateSecret: SETTINGS.SOCIAL_STATE_SECRET,
    });
  });

  it('stays unconfigured while the settings are missing', async () => {
    stubSettings(
      Object.fromEntries(Object.keys(SETTINGS).map((name) => [name, ''])),
    );

    const module = await compile();

    expect(module.get(INSTAGRAM_CONFIG)).toBeUndefined();
  });

  it('refuses to save an account until account storage (19.3) is built', async () => {
    const module = await compile();
    const store = module.get<SocialAccountStore>(SOCIAL_ACCOUNT_STORE);

    await expect(
      store.save({
        creatorId: '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b',
        platform: 'instagram',
        platformUserId: '1784',
        username: 'rangga.creates',
        accessToken: 'IGAA-token',
        refreshToken: null,
        tokenExpiresAt: null,
      }),
    ).rejects.toThrow(/not ready/);
  });

  it('is switched on in the app', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule)).toContain(
      SocialModule,
    );
  });

  // #126 and #127 both answer under /social: Instagram's own controller and TikTok's generic
  // /social/:platform/…. Whichever is registered first takes /social/instagram/…, so this pins
  // each platform to the controller that can connect it.
  describe('which controller answers each platform', () => {
    const CREATOR = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';

    async function connect(platform: string) {
      stubSettings({
        ...SETTINGS,
        SOCIAL_TOKEN_KEY: randomBytes(32).toString('base64'),
        TIKTOK_CLIENT_KEY: 'sbawexamplekey',
        TIKTOK_CLIENT_SECRET: 'tiktok-secret',
        TIKTOK_REDIRECT_URI:
          'https://staging.tofly.id/api/social/tiktok/callback',
        DEV_AUTH_ENABLED: 'true',
        DEV_CREATOR_ID: '',
        NODE_ENV: 'test',
      });
      const module = await Test.createTestingModule({ imports: [SocialModule] })
        .overrideProvider(PrismaService)
        .useValue({
          creators: { findUnique: () => Promise.resolve({ id: CREATOR }) },
        })
        .compile();
      const app = module.createNestApplication();
      await app.init();
      try {
        const response = await request(app.getHttpServer())
          .get(`/social/${platform}/connect`)
          .set(DEV_CREATOR_HEADER, CREATOR)
          .expect(302);
        return response.headers.location;
      } finally {
        await app.close();
      }
    }

    it("sends Instagram's Hubungkan to Instagram, through its own controller", async () => {
      await expect(connect('instagram')).resolves.toMatch(
        /^https:\/\/www\.instagram\.com\/oauth\/authorize\?/,
      );
    });

    it("sends TikTok's Hubungkan to TikTok, through the generic controller", async () => {
      await expect(connect('tiktok')).resolves.toMatch(
        /^https:\/\/www\.tiktok\.com\/v2\/auth\/authorize\/\?/,
      );
    });
  });
});
