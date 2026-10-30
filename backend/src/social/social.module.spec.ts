import { Logger } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module.js';
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
});
