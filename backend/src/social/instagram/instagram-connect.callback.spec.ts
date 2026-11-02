// The whole callback (Jira 19.1: "a callback test with mocked Instagram responses"): the real
// controller, connect use case and Instagram client, with only Instagram's HTTP answers and
// account storage standing in.

import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { CreatorRequest } from '../../auth/creator-request.js';
import { DevCreatorGuard } from '../../auth/dev-creator.guard.js';
import { signState } from '../connect-state.js';
import type { SocialAccountStore } from '../ports.js';
import { storageNotReady } from '../unready-store.js';
import {
  INSTAGRAM_GRAPH_URL,
  INSTAGRAM_TOKEN_URL,
  InstagramClient,
} from './instagram-client.js';
import type { InstagramConfig } from './instagram-config.js';
import {
  INSTAGRAM_CONFIG,
  INSTAGRAM_CONNECT,
  INSTAGRAM_LOG,
  InstagramConnectController,
} from './instagram-connect.controller.js';
import { InstagramConnectService } from './instagram-connect.service.js';

const CONFIG: InstagramConfig = {
  appId: '1234567890',
  appSecret: 'app-secret-xyz',
  redirectUri: 'http://localhost:3000/api/social/instagram/callback',
  stateSecret: 'state-secret-of-at-least-32-chars!!',
};
const CREATOR = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const CODE = 'AQBx-instagram-code';
const SHORT_TOKEN = 'IGAA-short-lived-token';
const LONG_TOKEN = 'IGAA-long-lived-token';
const NOW = Date.UTC(2026, 9, 29, 10, 0, 0);
const SIXTY_DAYS_S = 5_184_000;

const errorPath = (code: string) =>
  `/creator/performance?platform=instagram&error=${code}`;

interface InstagramReplies {
  token?: { status: number; body: unknown };
  profile?: { status: number; body: unknown };
}

// Instagram's three answers, the happy path unless a test says otherwise.
function instagram(replies: InstagramReplies = {}) {
  return vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = String(input);
    const reply =
      url === INSTAGRAM_TOKEN_URL
        ? (replies.token ?? {
            status: 200,
            body: { data: [{ access_token: SHORT_TOKEN, user_id: '1784' }] },
          })
        : url.startsWith(`${INSTAGRAM_GRAPH_URL}/access_token?`)
          ? {
              status: 200,
              body: { access_token: LONG_TOKEN, expires_in: SIXTY_DAYS_S },
            }
          : (replies.profile ?? {
              status: 200,
              body: {
                user_id: '17841400000000000',
                username: 'rangga.creates',
                account_type: 'MEDIA_CREATOR',
              },
            });
    return new Response(JSON.stringify(reply.body), { status: reply.status });
  });
}

describe('GET /social/instagram/callback with Instagram mocked', () => {
  let app: INestApplication;
  const log = { warn: vi.fn() };
  const save = vi.fn<SocialAccountStore['save']>();

  const signedIn = {
    canActivate(context: ExecutionContext) {
      context.switchToHttp().getRequest<CreatorRequest>().creatorId = CREATOR;
      return true;
    },
  };

  async function start(
    replies: InstagramReplies = {},
    store: SocialAccountStore = { save },
  ) {
    const client = new InstagramClient(
      CONFIG,
      instagram(replies) as unknown as typeof fetch,
      () => NOW,
    );
    const module = await Test.createTestingModule({
      controllers: [InstagramConnectController],
      providers: [
        { provide: INSTAGRAM_CONFIG, useValue: CONFIG },
        { provide: INSTAGRAM_LOG, useValue: log },
        {
          provide: INSTAGRAM_CONNECT,
          useValue: new InstagramConnectService(client, store, log),
        },
      ],
    })
      .overrideGuard(DevCreatorGuard)
      .useValue(signedIn)
      .compile();
    app = module.createNestApplication();
    await app.init();
  }

  function callback() {
    return request(app.getHttpServer())
      .get('/social/instagram/callback')
      .query({
        code: CODE,
        state: signState(
          { creatorId: CREATOR, platform: 'instagram' },
          CONFIG.stateSecret,
        ),
      });
  }

  beforeEach(() => {
    log.warn.mockReset();
    save.mockReset().mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await app.close();
  });

  it('hands a Professional account and its long-lived token to storage and lands on Performa connected', async () => {
    await start();

    const response = await callback();

    expect(save).toHaveBeenCalledWith({
      creatorId: CREATOR,
      platform: 'instagram',
      platformUserId: '17841400000000000',
      username: 'rangga.creates',
      accessToken: LONG_TOKEN,
      refreshToken: null,
      tokenExpiresAt: new Date(NOW + SIXTY_DAYS_S * 1000),
    });
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(
      '/creator/performance?platform=instagram&connected=1',
    );
  });

  it('lands a personal account on not_professional and saves nothing', async () => {
    await start({
      profile: {
        status: 200,
        body: { user_id: '1', username: 'rangga', account_type: 'PERSONAL' },
      },
    });

    const response = await callback();

    expect(response.headers.location).toBe(errorPath('not_professional'));
    expect(save).not.toHaveBeenCalled();
  });

  it('lands an account that is not a tester of the app on not_tester', async () => {
    await start({
      token: {
        status: 400,
        body: {
          error_type: 'OAuthException',
          code: 400,
          error_message: 'Insufficient developer role',
        },
      },
    });

    const response = await callback();

    expect(response.headers.location).toBe(errorPath('not_tester'));
    expect(save).not.toHaveBeenCalled();
  });

  it('lands an error from Instagram on platform_error', async () => {
    await start({ profile: { status: 500, body: {} } });

    const response = await callback();

    expect(response.headers.location).toBe(errorPath('platform_error'));
    expect(save).not.toHaveBeenCalled();
  });

  it('lands on platform_error while account storage (19.3) is not built', async () => {
    await start({}, storageNotReady);

    const response = await callback();

    expect(response.headers.location).toBe(errorPath('platform_error'));
  });

  it('never puts the app secret or a token in the redirect', async () => {
    await start();

    const { location } = (await callback()).headers;

    for (const secret of [CONFIG.appSecret, SHORT_TOKEN, LONG_TOKEN]) {
      expect(location).not.toContain(secret);
    }
  });
});
