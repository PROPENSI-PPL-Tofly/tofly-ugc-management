import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { CreatorRequest } from '../../auth/creator-request.js';
import { DevCreatorGuard } from '../../auth/dev-creator.guard.js';
import { signState, verifyState } from '../connect-state.js';
import { INSTAGRAM_AUTHORIZE_URL } from './instagram-authorization.js';
import type { InstagramConfig } from './instagram-config.js';
import {
  INSTAGRAM_CONFIG,
  INSTAGRAM_CONNECT,
  INSTAGRAM_LOG,
  InstagramConnectController,
  MAX_INSTAGRAM_CODE_LENGTH,
} from './instagram-connect.controller.js';

const CONFIG: InstagramConfig = {
  appId: '1234567890',
  appSecret: 'app-secret-xyz',
  redirectUri: 'http://localhost:3000/api/social/instagram/callback',
  stateSecret: 'state-secret-of-at-least-32-chars!!',
};
const CREATOR = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const OTHER_CREATOR = '0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d';
const CODE = 'AQBx-instagram-code';
const CONNECTED = '/creator/performance?platform=instagram&connected=1';
const errorPath = (code: string) =>
  `/creator/performance?platform=instagram&error=${code}`;

describe('InstagramConnectController', () => {
  const connect = { complete: vi.fn() };
  const log = { warn: vi.fn() };
  let app: INestApplication;

  // Stands in for the creator session: the request is made by CREATOR.
  const signedIn = {
    canActivate(context: ExecutionContext) {
      context.switchToHttp().getRequest<CreatorRequest>().creatorId = CREATOR;
      return true;
    },
  };

  async function start(config: InstagramConfig | undefined = CONFIG) {
    const module = await Test.createTestingModule({
      controllers: [InstagramConnectController],
      providers: [
        { provide: INSTAGRAM_CONFIG, useValue: config },
        { provide: INSTAGRAM_CONNECT, useValue: connect },
        { provide: INSTAGRAM_LOG, useValue: log },
      ],
    })
      .overrideGuard(DevCreatorGuard)
      .useValue(signedIn)
      .compile();
    app = module.createNestApplication();
    await app.init();
  }

  function stateFor(creatorId: string = CREATOR): string {
    return signState({ creatorId, platform: 'instagram' }, CONFIG.stateSecret);
  }

  function callback(query: Record<string, string>) {
    return request(app.getHttpServer())
      .get('/social/instagram/callback')
      .query(query);
  }

  beforeEach(() => {
    connect.complete.mockReset().mockResolvedValue(CONNECTED);
    log.warn.mockReset();
  });

  afterEach(async () => {
    await app.close();
  });

  it('lets only a signed-in creator reach either route', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, InstagramConnectController),
    ).toEqual([DevCreatorGuard]);
  });

  describe('GET /social/instagram/connect', () => {
    beforeEach(() => start());

    it("sends the creator to Instagram's consent screen with a state signed for them", async () => {
      const response = await request(app.getHttpServer()).get(
        '/social/instagram/connect',
      );

      expect(response.status).toBe(302);
      expect(response.headers['cache-control']).toBe('no-store');
      const location = new URL(response.headers.location);
      expect(`${location.origin}${location.pathname}`).toBe(
        INSTAGRAM_AUTHORIZE_URL,
      );
      expect(
        verifyState(location.searchParams.get('state'), CONFIG.stateSecret, {
          creatorId: CREATOR,
          platform: 'instagram',
        }),
      ).toBe(true);
    });

    it('starts a different state on every visit', async () => {
      const first = await request(app.getHttpServer()).get(
        '/social/instagram/connect',
      );
      const second = await request(app.getHttpServer()).get(
        '/social/instagram/connect',
      );

      expect(
        new URL(first.headers.location).searchParams.get('state'),
      ).not.toBe(new URL(second.headers.location).searchParams.get('state'));
    });

    it('never sends the app secret or the state secret to the browser', async () => {
      const response = await request(app.getHttpServer()).get(
        '/social/instagram/connect',
      );

      expect(response.headers.location).not.toContain(CONFIG.appSecret);
      expect(response.headers.location).not.toContain(CONFIG.stateSecret);
    });
  });

  describe('GET /social/instagram/connect without the Instagram app configured', () => {
    beforeEach(() => start(undefined));

    it('lands on Performa with platform_error and says what is missing in the log', async () => {
      const response = await request(app.getHttpServer()).get(
        '/social/instagram/connect',
      );

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(errorPath('platform_error'));
      expect(log.warn).toHaveBeenCalledOnce();
    });
  });

  describe('GET /social/instagram/callback', () => {
    beforeEach(() => start());

    it('completes the connect for the creator whose state it is and follows its answer', async () => {
      const response = await callback({ code: CODE, state: stateFor() });

      expect(connect.complete).toHaveBeenCalledWith(CREATOR, CODE);
      expect(response.status).toBe(302);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers.location).toBe(CONNECTED);
    });

    it("trims the '#_' Instagram adds to the end of a code", async () => {
      await callback({ code: `${CODE}#_`, state: stateFor() });

      expect(connect.complete).toHaveBeenCalledWith(CREATOR, CODE);
    });

    // Built inside each test, so every state is signed at the moment it is sent.
    it.each<[string, () => Record<string, string>]>([
      ['has no state', () => ({ code: CODE })],
      [
        'has a state signed for another creator',
        () => ({ code: CODE, state: stateFor(OTHER_CREATOR) }),
      ],
      ['has a tampered state', () => ({ code: CODE, state: `${stateFor()}x` })],
    ])(
      'refuses a callback that %s, without asking Instagram',
      async (_label, query) => {
        const response = await callback(query());

        expect(response.headers.location).toBe(errorPath('platform_error'));
        expect(connect.complete).not.toHaveBeenCalled();
        expect(log.warn).toHaveBeenCalledOnce();
      },
    );

    it('reports a cancelled consent as cancelled', async () => {
      const response = await callback({
        error: 'access_denied',
        error_reason: 'user_denied',
        state: stateFor(),
      });

      expect(response.headers.location).toBe(errorPath('cancelled'));
      expect(connect.complete).not.toHaveBeenCalled();
    });

    it('checks the state before believing a cancellation', async () => {
      const response = await callback({ error: 'access_denied' });

      expect(response.headers.location).toBe(errorPath('platform_error'));
    });

    it.each<[string, Record<string, string>]>([
      ['any other error from Instagram', { error: 'server_error' }],
      ['no code', {}],
      ['an empty code', { code: '' }],
      [
        'a code over the length limit',
        { code: 'c'.repeat(MAX_INSTAGRAM_CODE_LENGTH + 1) },
      ],
    ])(
      'lands on Performa with platform_error for %s',
      async (_label, query) => {
        const response = await callback({ ...query, state: stateFor() });

        expect(response.headers.location).toBe(errorPath('platform_error'));
        expect(connect.complete).not.toHaveBeenCalled();
      },
    );

    it('accepts a code of exactly the length limit', async () => {
      const code = 'c'.repeat(MAX_INSTAGRAM_CODE_LENGTH);

      await callback({ code, state: stateFor() });

      expect(connect.complete).toHaveBeenCalledWith(CREATOR, code);
    });

    it('never writes the code into the log', async () => {
      await callback({ code: CODE, state: stateFor(OTHER_CREATOR) });

      for (const [message] of log.warn.mock.calls as [string][]) {
        expect(message).not.toContain(CODE);
      }
    });
  });

  describe('GET /social/instagram/callback without the Instagram app configured', () => {
    beforeEach(() => start(undefined));

    it('lands on Performa with platform_error without asking Instagram', async () => {
      const response = await callback({ code: CODE, state: stateFor() });

      expect(response.headers.location).toBe(errorPath('platform_error'));
      expect(connect.complete).not.toHaveBeenCalled();
    });
  });
});
