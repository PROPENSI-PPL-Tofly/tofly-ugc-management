import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../app.module.js';
import { DEV_CREATOR_HEADER } from '../auth/dev-creator.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MySocialAccountsController } from './my-social-accounts.controller.js';
import { PrismaSocialAccountLinker } from './prisma-social-account-linker.js';
import { SOCIAL_WIRING, type SocialWiring } from './social-config.js';
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

  it("keeps Instagram's accounts in the same encrypted store as TikTok's", async () => {
    stubSettings({ SOCIAL_TOKEN_KEY: randomBytes(32).toString('base64') });

    const module = await compile();

    expect(module.get<SocialWiring>(SOCIAL_WIRING).linker).toBeInstanceOf(
      PrismaSocialAccountLinker,
    );
  });

  it('serves the Akun Terhubung API', async () => {
    const module = await compile();

    expect(module.get(MySocialAccountsController)).toBeInstanceOf(
      MySocialAccountsController,
    );
  });

  it('is switched on in the app', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule)).toContain(
      SocialModule,
    );
  });

  // Both platforms are SocialOAuthProviders behind the generic /social/:platform/… (review #126),
  // so this pins each one's Hubungkan to its own consent screen.
  describe('which platform each Hubungkan reaches', () => {
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

    it("sends Instagram's Hubungkan to Instagram, through the generic controller", async () => {
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
