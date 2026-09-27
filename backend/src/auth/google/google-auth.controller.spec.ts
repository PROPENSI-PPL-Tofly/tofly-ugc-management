import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { GOOGLE_AUTHORIZE_URL } from './authorization.js';
import { flowCookie, type FlowCookie } from './flow-cookie.js';
import {
  AUTH_LOG,
  FLOW_COOKIE,
  GOOGLE_OAUTH_CONFIG,
  GoogleAuthController,
  SIGN_IN,
} from './google-auth.controller.js';
import { parseFlow, serializeFlow, type OAuthFlow } from './oauth-flow.js';

const CONFIG = {
  clientId: 'client-123.apps.googleusercontent.com',
  clientSecret: 'secret-xyz',
  redirectUri: 'http://localhost:3000/api/auth/google/callback',
};
const DEV_COOKIE = flowCookie({ NODE_ENV: 'development' });
const FLOW: OAuthFlow = {
  state: 's'.repeat(43),
  nonce: 'n'.repeat(43),
  verifier: 'v'.repeat(43),
};
const CODE = '4/0AVG7fiQ-example-code';

describe('flowCookie', () => {
  it('uses a host-only, secure cookie in production', () => {
    expect(flowCookie({ NODE_ENV: 'production' })).toEqual({
      name: '__Host-tofly_oauth',
      options: {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 600_000,
      },
    });
  });

  it('drops Secure and the __Host- prefix on plain-http local development', () => {
    expect(DEV_COOKIE).toEqual({
      name: 'tofly_oauth',
      options: {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
        maxAge: 600_000,
      },
    });
  });
});

describe('GoogleAuthController', () => {
  const signIn = { complete: vi.fn() };
  const log = { warn: vi.fn() };
  let app: INestApplication;

  async function start(config: typeof CONFIG | undefined, cookie: FlowCookie) {
    const module = await Test.createTestingModule({
      controllers: [GoogleAuthController],
      providers: [
        { provide: GOOGLE_OAUTH_CONFIG, useValue: config },
        { provide: FLOW_COOKIE, useValue: cookie },
        { provide: SIGN_IN, useValue: signIn },
        { provide: AUTH_LOG, useValue: log },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    await app.init();
  }

  beforeEach(() => {
    signIn.complete.mockReset().mockResolvedValue('/admin/creators');
    log.warn.mockReset();
  });

  afterEach(async () => {
    await app.close();
  });

  function setCookies(response: request.Response): string[] {
    return ([] as string[]).concat(response.headers['set-cookie'] ?? []);
  }

  describe('GET /auth/google', () => {
    beforeEach(() => start(CONFIG, DEV_COOKIE));

    it('stores a fresh flow in an httpOnly cookie and sends the browser to Google with its state', async () => {
      const response = await request(app.getHttpServer()).get('/auth/google');

      expect(response.status).toBe(302);
      expect(response.headers['cache-control']).toBe('no-store');
      const location = new URL(response.headers.location);
      expect(`${location.origin}${location.pathname}`).toBe(
        GOOGLE_AUTHORIZE_URL,
      );

      const [cookie] = setCookies(response);
      expect(cookie).toMatch(/^tofly_oauth=/);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Path=/');
      expect(cookie).toContain('Max-Age=600');
      expect(cookie).not.toContain('Secure');

      const flow = parseFlow(cookie.split(';')[0].split('=')[1]);
      expect(flow?.state).toBe(location.searchParams.get('state'));
      expect(flow?.nonce).toBe(location.searchParams.get('nonce'));
      expect(location.href).not.toContain(flow!.verifier);
    });

    it('starts a different flow on every visit', async () => {
      const first = await request(app.getHttpServer()).get('/auth/google');
      const second = await request(app.getHttpServer()).get('/auth/google');

      expect(
        new URL(first.headers.location).searchParams.get('state'),
      ).not.toBe(new URL(second.headers.location).searchParams.get('state'));
    });
  });

  it('sends the browser back to the login page when Google sign-in is not configured', async () => {
    await start(undefined, DEV_COOKIE);

    const response = await request(app.getHttpServer()).get('/auth/google');

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/login?error=sign_in_failed');
    expect(setCookies(response)).toEqual([]);
    expect(log.warn).toHaveBeenCalledWith(
      'Google sign-in is not configured: set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI',
    );
  });

  describe('GET /auth/google/callback', () => {
    beforeEach(() => start(CONFIG, DEV_COOKIE));

    function callback(
      query: string,
      cookie: string | null = serializeFlow(FLOW),
    ) {
      const call = request(app.getHttpServer()).get(
        `/auth/google/callback${query}`,
      );
      return cookie === null
        ? call
        : call.set('Cookie', `tofly_oauth=${cookie}`);
    }

    it('hands a matching callback to the sign-in and follows where it lands', async () => {
      const response = await callback(`?code=${CODE}&state=${FLOW.state}`);

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/admin/creators');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(signIn.complete).toHaveBeenCalledWith(
        CODE,
        FLOW,
        expect.anything(),
      );
    });

    it('clears the flow cookie so the same callback cannot be replayed', async () => {
      const response = await callback(`?code=${CODE}&state=${FLOW.state}`);

      const [cleared] = setCookies(response);
      expect(cleared).toMatch(/^tofly_oauth=;/);
      expect(cleared).toContain('Expires=Thu, 01 Jan 1970');
      expect(cleared).toContain('Path=/');
    });

    it.each([
      [
        'a forged state (CSRF)',
        `?code=${CODE}&state=${'x'.repeat(43)}`,
        serializeFlow(FLOW),
      ],
      [
        'no flow cookie (replayed or expired)',
        `?code=${CODE}&state=${FLOW.state}`,
        null,
      ],
      [
        'a tampered flow cookie',
        `?code=${CODE}&state=${FLOW.state}`,
        'not-a-flow',
      ],
      ['no code', `?state=${FLOW.state}`, serializeFlow(FLOW)],
    ])(
      'fails the sign-in on %s without calling Google',
      async (_label, query, cookie) => {
        const response = await callback(query, cookie);

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('/login?error=sign_in_failed');
        expect(signIn.complete).not.toHaveBeenCalled();
        expect(setCookies(response)[0]).toMatch(/^tofly_oauth=;/);
        expect(log.warn).toHaveBeenCalledWith(
          expect.stringMatching(/^Google sign-in callback rejected: /),
        );
      },
    );

    it('reports a refusal on the consent screen as cancelled', async () => {
      const response = await callback(
        `?error=access_denied&state=${FLOW.state}`,
      );

      expect(response.headers.location).toBe('/login?error=cancelled');
      expect(signIn.complete).not.toHaveBeenCalled();
    });

    it('never follows a redirect target from the query', async () => {
      const response = await callback(
        `?code=${CODE}&state=${FLOW.state}&returnTo=https://evil.example`,
      );

      expect(response.headers.location).toBe('/admin/creators');
    });
  });
});
