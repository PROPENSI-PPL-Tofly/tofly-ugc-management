// The whole Instagram connect through the app's own wiring (Jira 19.1: "a callback test with
// mocked Instagram responses"; review #126, point 4): SocialModule's generic controller,
// SocialConnectService, the shared state signer, InstagramProvider and the encrypted linker,
// with only Instagram's HTTP answers and the database standing in.

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { DEV_CREATOR_HEADER } from '../../auth/dev-creator.guard.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SocialModule } from '../social.module.js';
import { INSTAGRAM_GRAPH_URL, INSTAGRAM_TOKEN_URL } from './instagram-client.js';

const CREATOR = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const CODE = 'AQBx-instagram-code';
const SHORT_TOKEN = 'IGAA-short-lived-token';
const LONG_TOKEN = 'IGAA-long-lived-token';
const APP_SECRET = 'app-secret-xyz';

const SETTINGS = {
  INSTAGRAM_APP_ID: '1234567890',
  INSTAGRAM_APP_SECRET: APP_SECRET,
  INSTAGRAM_REDIRECT_URI: 'http://localhost:3000/api/social/instagram/callback',
  SOCIAL_STATE_SECRET: 'state-secret-of-at-least-32-chars!!',
  SOCIAL_TOKEN_KEY: randomBytes(32).toString('base64'),
  DEV_AUTH_ENABLED: 'true',
  DEV_CREATOR_ID: '',
  NODE_ENV: 'test',
};

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
              body: { access_token: LONG_TOKEN, expires_in: 5_184_000 },
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

describe('Instagram connect through SocialModule with Instagram mocked', () => {
  let app: INestApplication;
  // Who holds an Instagram account already, as the linker asks the database.
  let holder: { creator_id: string } | null;
  const upsert = vi.fn();

  async function start(replies: InstagramReplies = {}) {
    for (const [name, value] of Object.entries(SETTINGS)) {
      vi.stubEnv(name, value);
    }
    vi.stubGlobal('fetch', instagram(replies));
    const module = await Test.createTestingModule({ imports: [SocialModule] })
      .overrideProvider(PrismaService)
      .useValue({
        creators: { findUnique: () => Promise.resolve({ id: CREATOR }) },
        social_accounts: {
          findUnique: ({ where }: { where: Record<string, unknown> }) =>
            Promise.resolve(
              'platform_platform_user_id' in where ? holder : null,
            ),
          upsert,
        },
      })
      .compile();
    app = module.createNestApplication();
    await app.init();
  }

  // Hubungkan, then Instagram's redirect back with the state it was handed.
  async function connectThenCallback() {
    const consent = await request(app.getHttpServer())
      .get('/social/instagram/connect')
      .set(DEV_CREATOR_HEADER, CREATOR)
      .expect(302);
    const state = new URL(consent.headers.location).searchParams.get('state');
    return request(app.getHttpServer())
      .get('/social/instagram/callback')
      .set(DEV_CREATOR_HEADER, CREATOR)
      .query({ code: `${CODE}#_`, state });
  }

  beforeEach(() => {
    holder = null;
    upsert.mockReset().mockResolvedValue({});
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('stores a Professional account with its token encrypted and lands on Performa connected', async () => {
    await start();

    const response = await connectThenCallback();

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(
      '/creator/performance?connected=instagram',
    );
    const [{ create }] = upsert.mock.calls[0] as [
      { create: Record<string, unknown> },
    ];
    expect(create).toMatchObject({
      creator_id: CREATOR,
      platform: 'instagram',
      platform_user_id: '17841400000000000',
      username: 'rangga.creates',
      refresh_token: null,
      is_connected: true,
    });
    expect(create.access_token).toEqual(expect.any(String));
    expect(create.access_token).not.toContain(LONG_TOKEN);
  });

  it('lands a personal account on not_professional and stores nothing', async () => {
    await start({
      profile: {
        status: 200,
        body: { user_id: '1', username: 'rangga', account_type: 'PERSONAL' },
      },
    });

    const response = await connectThenCallback();

    expect(response.headers.location).toBe(errorPath('not_professional'));
    expect(upsert).not.toHaveBeenCalled();
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

    const response = await connectThenCallback();

    expect(response.headers.location).toBe(errorPath('not_tester'));
    expect(upsert).not.toHaveBeenCalled();
  });

  it('lands an account another creator holds on account_taken', async () => {
    holder = { creator_id: 'another-creator' };
    await start();

    const response = await connectThenCallback();

    expect(response.headers.location).toBe(errorPath('account_taken'));
    expect(upsert).not.toHaveBeenCalled();
  });

  it('never puts the app secret or a token in the redirect', async () => {
    await start();

    const { location } = (await connectThenCallback()).headers;

    for (const secret of [APP_SECRET, SHORT_TOKEN, LONG_TOKEN]) {
      expect(location).not.toContain(secret);
    }
  });
});
