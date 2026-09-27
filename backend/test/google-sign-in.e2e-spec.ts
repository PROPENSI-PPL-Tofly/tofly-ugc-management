import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Response as ExpressResponse } from 'express';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { GOOGLE_OAUTH_CONFIG } from '../src/auth/google/google-auth.controller.js';
import { GoogleTokenClient } from '../src/auth/google/google-token-client.js';
import { pkceChallenge } from '../src/auth/google/oauth-flow.js';
import {
  CODE_EXCHANGER,
  ID_TOKEN_VERIFIER,
  SESSION_STARTER,
  WHITELIST_RESOLVER,
  type Principal,
} from '../src/auth/google/ports.js';
import { applySecurityHeaders } from '../src/security-headers.js';

const CONFIG = {
  clientId: 'e2e-client.apps.googleusercontent.com',
  clientSecret: 'e2e-secret',
  redirectUri: 'http://localhost:3000/api/auth/google/callback',
};

const PEOPLE: Record<string, Principal> = {
  'admin@example.com': { userId: 'user-admin', role: 'admin' },
  'creator@example.com': {
    userId: 'user-creator',
    role: 'creator',
    creatorId: 'creator-1',
  },
};

/**
 * Stands in for Google: remembers the PKCE challenge each code was issued for, and like Google
 * redeems a code once, only with the verifier behind that challenge.
 */
class FakeGoogle {
  private issued = new Map<
    string,
    { challenge: string; nonce: string; email: string }
  >();
  private seq = 0;

  /** The user picks an account on the consent screen; Google redirects back with a code. */
  consent(authorizeUrl: string, email: string): string {
    const params = new URL(authorizeUrl).searchParams;
    const code = `code-${++this.seq}`;
    this.issued.set(code, {
      challenge: params.get('code_challenge')!,
      nonce: params.get('nonce')!,
      email,
    });
    return code;
  }

  readonly fetch = (async (
    _url: string | URL | Request,
    init?: RequestInit,
  ) => {
    const body = new URLSearchParams(String(init?.body));
    const grant = this.issued.get(body.get('code')!);
    this.issued.delete(body.get('code')!);
    if (
      !grant ||
      body.get('client_secret') !== CONFIG.clientSecret ||
      pkceChallenge(body.get('code_verifier')!) !== grant.challenge
    ) {
      return new Response(JSON.stringify({ error: 'invalid_grant' }), {
        status: 400,
      });
    }
    // The "ID token" carries what a real one would: who, and the nonce it was issued for.
    const idToken = `${grant.email}|${grant.nonce}`;
    return new Response(JSON.stringify({ id_token: idToken }), { status: 200 });
  }) as typeof fetch;
}

describe('Google sign-in (e2e)', () => {
  let app: INestApplication;
  let google: FakeGoogle;

  beforeAll(async () => {
    google = new FakeGoogle();
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(GOOGLE_OAUTH_CONFIG)
      .useValue(CONFIG)
      .overrideProvider(CODE_EXCHANGER)
      .useValue(new GoogleTokenClient(CONFIG, google.fetch))
      .overrideProvider(ID_TOKEN_VERIFIER)
      .useValue({
        verify: (idToken: string, nonce: string) => {
          const [email, tokenNonce] = idToken.split('|');
          return tokenNonce === nonce
            ? Promise.resolve({ sub: `g-${email}`, email })
            : Promise.reject(new Error('nonce mismatch'));
        },
      })
      .overrideProvider(WHITELIST_RESOLVER)
      .useValue({
        resolve: (email: string) => Promise.resolve(PEOPLE[email] ?? null),
      })
      .overrideProvider(SESSION_STARTER)
      .useValue({
        start: (response: ExpressResponse, principal: Principal) => {
          response.cookie('tofly_session', principal.userId, {
            httpOnly: true,
          });
          return Promise.resolve();
        },
      })
      .compile();
    app = moduleFixture.createNestApplication();
    applySecurityHeaders(app);
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  /** GET /auth/google as a browser would: the Google URL and the flow cookie it was given. */
  async function begin() {
    const response = await request(app.getHttpServer()).get('/auth/google');
    const cookie = ([] as string[])
      .concat(response.headers['set-cookie'])[0]
      .split(';')[0];
    return { location: response.headers.location as string, cookie };
  }

  function callback(query: Record<string, string>, cookie?: string) {
    const call = request(app.getHttpServer())
      .get('/auth/google/callback')
      .query(query);
    return cookie ? call.set('Cookie', cookie) : call;
  }

  function cookies(response: request.Response): string[] {
    return ([] as string[]).concat(response.headers['set-cookie'] ?? []);
  }

  it.each([
    ['an admin', 'admin@example.com', '/admin/creators', 'user-admin'],
    ['a creator', 'creator@example.com', '/creator/tasks', 'user-creator'],
  ])(
    'signs %s in end to end and lands them on their page',
    async (_label, email, landing, userId) => {
      const { location, cookie } = await begin();
      const state = new URL(location).searchParams.get('state')!;
      const code = google.consent(location, email);

      const response = await callback({ code, state }, cookie);

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(landing);
      expect(cookies(response)).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/^tofly_oauth=;/),
          expect.stringMatching(new RegExp(`^tofly_session=${userId};`)),
        ]),
      );
    },
  );

  it('turns away a Google account the admin has not whitelisted', async () => {
    const { location, cookie } = await begin();
    const state = new URL(location).searchParams.get('state')!;
    const code = google.consent(location, 'stranger@example.com');

    const response = await callback({ code, state }, cookie);

    expect(response.headers.location).toBe('/login?error=not_authorized');
    expect(cookies(response).join()).not.toContain('tofly_session=');
  });

  it('refuses a replayed callback once the flow cookie is spent', async () => {
    const { location, cookie } = await begin();
    const state = new URL(location).searchParams.get('state')!;
    const code = google.consent(location, 'admin@example.com');
    await callback({ code, state }, cookie);

    // The browser dropped the cookie; an attacker replaying the URL has none.
    const replay = await callback({ code, state });
    // Even with a copy of the old cookie, Google redeems a code only once.
    const stolenCookie = await callback({ code, state }, cookie);

    expect(replay.headers.location).toBe('/login?error=sign_in_failed');
    expect(stolenCookie.headers.location).toBe('/login?error=sign_in_failed');
  });

  it("refuses a callback forged from the attacker's own sign-in (login CSRF)", async () => {
    const victim = await begin();
    const attacker = await begin();
    const attackerState = new URL(attacker.location).searchParams.get('state')!;
    const code = google.consent(attacker.location, 'admin@example.com');

    const response = await callback(
      { code, state: attackerState },
      victim.cookie,
    );

    expect(response.headers.location).toBe('/login?error=sign_in_failed');
    expect(cookies(response).join()).not.toContain('tofly_session=');
  });

  it('refuses a genuine code whose state is not the one in the flow cookie', async () => {
    // Everything but the state is valid, so only the state check can stop it: the code was
    // issued for this cookie's own PKCE challenge.
    const mine = await begin();
    const other = await begin();
    const otherState = new URL(other.location).searchParams.get('state')!;
    const code = google.consent(mine.location, 'admin@example.com');

    const response = await callback({ code, state: otherState }, mine.cookie);

    expect(response.headers.location).toBe('/login?error=sign_in_failed');
    expect(cookies(response).join()).not.toContain('tofly_session=');
  });

  it('refuses an intercepted code redeemed with a different PKCE verifier', async () => {
    const victim = await begin();
    const attacker = await begin();
    const attackerState = new URL(attacker.location).searchParams.get('state')!;
    // The code was issued for the victim's challenge; the attacker's cookie has another verifier.
    const code = google.consent(victim.location, 'admin@example.com');

    const response = await callback(
      { code, state: attackerState },
      attacker.cookie,
    );

    expect(response.headers.location).toBe('/login?error=sign_in_failed');
  });

  it('reports a refusal on the consent screen as cancelled', async () => {
    const { location, cookie } = await begin();
    const state = new URL(location).searchParams.get('state')!;

    const response = await callback({ error: 'access_denied', state }, cookie);

    expect(response.headers.location).toBe('/login?error=cancelled');
  });

  it('keeps every answer out of caches and never follows a redirect target from the query', async () => {
    const { location, cookie } = await begin();
    const state = new URL(location).searchParams.get('state')!;
    const code = google.consent(location, 'admin@example.com');

    const response = await callback(
      {
        code,
        state,
        redirect_uri: 'https://evil.example',
        next: '//evil.example',
      },
      cookie,
    );

    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.location).toBe('/admin/creators');
  });
});
