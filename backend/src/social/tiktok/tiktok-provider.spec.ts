import { PlatformRefusal } from '../ports.js';
import {
  MAX_USERNAME_LENGTH,
  REQUESTED_SCOPES,
  TIKTOK_AUTHORIZE_URL,
  TIKTOK_TOKEN_URL,
  TIKTOK_USER_INFO_URL,
  TIKTOK_TIMEOUT_MS,
  TikTokProvider,
} from './tiktok-provider.js';
import type { TikTokConfig } from './tiktok-config.js';

const CONFIG: TikTokConfig = {
  clientKey: 'sbawexamplekey',
  clientSecret: 'super-secret-value',
  redirectUri: 'https://staging.tofly.id/api/social/tiktok/callback',
};
const NOW = new Date('2026-10-29T03:00:00.000Z');
const CODE = 'auth-code-123*!';
const ACCESS = 'act.access-token-value';
const REFRESH = 'rft.refresh-token-value';
const OPEN_ID = 'afd97af1-b87b-48b9-ac98-410aghda5344';

/** The token endpoint's answer for a creator who granted every scope (TikTok's own example). */
function tokenBody(overrides: Record<string, unknown> = {}): unknown {
  return {
    access_token: ACCESS,
    expires_in: 86_400,
    open_id: OPEN_ID,
    refresh_token: REFRESH,
    refresh_expires_in: 31_536_000,
    scope: 'user.info.basic,user.info.profile,video.list',
    token_type: 'Bearer',
    ...overrides,
  };
}

function userBody(user: Record<string, unknown> = {}, code = 'ok'): unknown {
  return {
    data: { user: { open_id: OPEN_ID, username: 'rangga.creates', ...user } },
    error: { code, message: '', log_id: '20261029030000' },
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** A fetch that answers the token call, then the user-info call, in that order. */
function tiktok(
  token: () => Response,
  user: () => Response = () => json(userBody()),
) {
  return vi.fn<typeof fetch>(async (input) =>
    String(input).startsWith(TIKTOK_TOKEN_URL) ? token() : user(),
  );
}

function provider(fetchImpl: typeof fetch): TikTokProvider {
  return new TikTokProvider(CONFIG, fetchImpl, () => NOW);
}

/** The refusal `connect` rejected with, so its outcome and log reason can both be checked. */
async function refusalOf(promise: Promise<unknown>): Promise<PlatformRefusal> {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(PlatformRefusal);
  return error as PlatformRefusal;
}

describe('TikTokProvider', () => {
  it('is the TikTok provider', () => {
    expect(provider(tiktok(() => json(tokenBody()))).platform).toBe('tiktok');
  });

  describe('authorizationUrl', () => {
    it('sends the creator to TikTok Login Kit with the app, the scopes PBI-19 needs and the state', () => {
      const url = new URL(
        provider(tiktok(() => json(tokenBody()))).authorizationUrl(
          'signed.state.value',
        ),
      );

      expect(`${url.origin}${url.pathname}`).toBe(TIKTOK_AUTHORIZE_URL);
      expect(Object.fromEntries(url.searchParams)).toEqual({
        client_key: 'sbawexamplekey',
        response_type: 'code',
        scope: 'user.info.basic,user.info.profile,video.list',
        redirect_uri: 'https://staging.tofly.id/api/social/tiktok/callback',
        state: 'signed.state.value',
      });
    });

    it('never puts the client secret in the browser', () => {
      const url = provider(tiktok(() => json(tokenBody()))).authorizationUrl(
        's',
      );

      expect(url).not.toContain('super-secret-value');
    });

    it('asks for exactly the three scopes in the PRD', () => {
      expect(REQUESTED_SCOPES).toEqual([
        'user.info.basic',
        'user.info.profile',
        'video.list',
      ]);
    });
  });

  describe('callbackError', () => {
    const tik = provider(tiktok(() => json(tokenBody())));

    it('reads a refused consent as cancelled', () => {
      expect(tik.callbackError('access_denied')).toBe('cancelled');
    });

    it.each(['server_error', 'invalid_scope', 'something_new'])(
      'reads %s as a platform error',
      (error) => {
        expect(tik.callbackError(error)).toBe('platform_error');
      },
    );

    it('does not read inherited object keys as a mapping', () => {
      expect(tik.callbackError('toString')).toBe('platform_error');
      expect(tik.callbackError('__proto__')).toBe('platform_error');
    });
  });

  describe('connect', () => {
    it('trades the code for tokens and reads the username', async () => {
      const fetchImpl = tiktok(() => json(tokenBody()));

      await expect(provider(fetchImpl).connect(CODE)).resolves.toEqual({
        platform: 'tiktok',
        platformUserId: OPEN_ID,
        username: 'rangga.creates',
        accessToken: ACCESS,
        accessTokenExpiresAt: new Date('2026-10-30T03:00:00.000Z'),
        refreshToken: REFRESH,
        refreshTokenExpiresAt: new Date('2027-10-29T03:00:00.000Z'),
      });
    });

    it('posts the code and the client secret server to server, as a form', async () => {
      const fetchImpl = tiktok(() => json(tokenBody()));

      await provider(fetchImpl).connect(CODE);

      const [url, init] = fetchImpl.mock.calls[0];
      expect(url).toBe(TIKTOK_TOKEN_URL);
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        'content-type': 'application/x-www-form-urlencoded',
      });
      expect(
        Object.fromEntries(new URLSearchParams(String(init?.body))),
      ).toEqual({
        client_key: 'sbawexamplekey',
        client_secret: 'super-secret-value',
        code: CODE,
        grant_type: 'authorization_code',
        redirect_uri: 'https://staging.tofly.id/api/social/tiktok/callback',
      });
    });

    it('reads the profile with the new access token as a bearer token', async () => {
      const fetchImpl = tiktok(() => json(tokenBody()));

      await provider(fetchImpl).connect(CODE);

      const [url, init] = fetchImpl.mock.calls[1];
      const read = new URL(String(url));
      expect(`${read.origin}${read.pathname}`).toBe(TIKTOK_USER_INFO_URL);
      expect(read.searchParams.get('fields')).toBe('open_id,username');
      expect(init?.method).toBe('GET');
      expect(init?.headers).toMatchObject({
        authorization: `Bearer ${ACCESS}`,
      });
    });

    // OWASP A01:2025 (SSRF): a redirect from either endpoint would send the secret or the
    // token to whatever host it names, and a stalled TikTok must not hold the request open.
    it('refuses redirects and bounds every call with a timeout', async () => {
      const timeout = vi.spyOn(AbortSignal, 'timeout');
      const fetchImpl = tiktok(() => json(tokenBody()));

      await provider(fetchImpl).connect(CODE);

      expect(fetchImpl).toHaveBeenCalledTimes(2);
      for (const [, init] of fetchImpl.mock.calls) {
        expect(init?.redirect).toBe('error');
        expect(init?.signal).toBeInstanceOf(AbortSignal);
      }
      expect(timeout).toHaveBeenCalledWith(TIKTOK_TIMEOUT_MS);
      timeout.mockRestore();
    });

    it('keeps the access token valid for exactly as long as TikTok says', async () => {
      const fetchImpl = tiktok(() =>
        json(tokenBody({ expires_in: 1, refresh_expires_in: 1 })),
      );

      const account = await provider(fetchImpl).connect(CODE);

      expect(account.accessTokenExpiresAt).toEqual(
        new Date('2026-10-29T03:00:01.000Z'),
      );
      expect(account.refreshTokenExpiresAt).toEqual(
        new Date('2026-10-29T03:00:01.000Z'),
      );
    });

    it('accepts the scopes in any order', async () => {
      const fetchImpl = tiktok(() =>
        json(
          tokenBody({ scope: 'video.list,user.info.profile,user.info.basic' }),
        ),
      );

      await expect(provider(fetchImpl).connect(CODE)).resolves.toMatchObject({
        username: 'rangga.creates',
      });
    });

    it.each([
      ['video.list', 'user.info.basic,user.info.profile'],
      ['user.info.profile', 'user.info.basic,video.list'],
    ])(
      'reads a consent without %s as cancelled: performance cannot be read without it',
      async (missing, scope) => {
        const refusal = await refusalOf(
          provider(tiktok(() => json(tokenBody({ scope })))).connect(CODE),
        );

        expect(refusal.outcome).toBe('cancelled');
        expect(refusal.message).toBe(`scope not granted: ${missing}`);
      },
    );

    describe('when the token exchange fails', () => {
      it('reads an unreachable TikTok as a platform error', async () => {
        const fetchImpl = vi
          .fn<typeof fetch>()
          .mockRejectedValue(
            new DOMException('The operation timed out.', 'TimeoutError'),
          );

        const refusal = await refusalOf(provider(fetchImpl).connect(CODE));

        expect(refusal.outcome).toBe('platform_error');
        expect(refusal.message).toBe('token endpoint unreachable');
      });

      it('reads a non-2xx answer as a platform error', async () => {
        const refusal = await refusalOf(
          provider(tiktok(() => json({}, 500))).connect(CODE),
        );

        expect(refusal.outcome).toBe('platform_error');
        expect(refusal.message).toBe('token endpoint answered 500');
      });

      it('reads a non-2xx answer that is not JSON by its status', async () => {
        const refusal = await refusalOf(
          provider(
            tiktok(() => new Response('Service Unavailable', { status: 503 })),
          ).connect(CODE),
        );

        expect(refusal.message).toBe('token endpoint answered 503');
      });

      // TikTok names its error in the body whatever the status, and that name is what tells a
      // sandbox refusal from an expired code when reading the log.
      it('names the error a non-2xx answer carries', async () => {
        const refusal = await refusalOf(
          provider(tiktok(() => json({ error: 'invalid_grant' }, 400))).connect(
            CODE,
          ),
        );

        expect(refusal.message).toBe('token endpoint refused: invalid_grant');
      });

      it('reads a body that is not JSON as a platform error', async () => {
        const refusal = await refusalOf(
          provider(tiktok(() => new Response('<html>busy</html>'))).connect(
            CODE,
          ),
        );

        expect(refusal.message).toBe('token endpoint sent no JSON');
      });

      it('logs the error TikTok named, never its description', async () => {
        const refusal = await refusalOf(
          provider(
            tiktok(() =>
              json({
                error: 'invalid_grant',
                error_description: `Authorization code ${CODE} is expired.`,
                log_id: '2026',
              }),
            ),
          ).connect(CODE),
        );

        expect(refusal.outcome).toBe('platform_error');
        expect(refusal.message).toBe('token endpoint refused: invalid_grant');
      });

      it('does not log an error name TikTok made too long or unreadable', async () => {
        const refusal = await refusalOf(
          provider(tiktok(() => json({ error: `x${'y'.repeat(80)}` }))).connect(
            CODE,
          ),
        );

        expect(refusal.message).toBe('token endpoint refused: unknown');
      });

      it.each([
        ['no access token', { access_token: undefined }],
        ['an empty access token', { access_token: '' }],
        ['no open id', { open_id: undefined }],
        ['no refresh token', { refresh_token: 42 }],
        ['a zero lifetime', { expires_in: 0 }],
        ['a negative lifetime', { expires_in: -5 }],
        ['a lifetime in text', { expires_in: '86400' }],
        ['no refresh lifetime', { refresh_expires_in: undefined }],
        ['an infinite lifetime', { refresh_expires_in: Infinity }],
        ['no scope', { scope: undefined }],
      ])(
        'reads an answer with %s as a platform error',
        async (_label, fields) => {
          const refusal = await refusalOf(
            provider(tiktok(() => json(tokenBody(fields)))).connect(CODE),
          );

          expect(refusal.outcome).toBe('platform_error');
          expect(refusal.message).toBe(
            'token endpoint sent an unusable answer',
          );
        },
      );

      it.each([
        ['null', null],
        ['an array', [tokenBody()]],
      ])('reads a JSON %s as a platform error', async (_label, body) => {
        const refusal = await refusalOf(
          provider(tiktok(() => json(body))).connect(CODE),
        );

        expect(refusal.message).toBe('token endpoint sent an unusable answer');
      });

      it('does not read the profile when there is no token to read it with', async () => {
        const fetchImpl = tiktok(() => json({ error: 'invalid_grant' }));

        await refusalOf(provider(fetchImpl).connect(CODE));

        expect(fetchImpl).toHaveBeenCalledTimes(1);
      });
    });

    describe('when the profile read fails', () => {
      it('reads an unreachable profile endpoint as a platform error', async () => {
        const refusal = await refusalOf(
          provider(
            tiktok(
              () => json(tokenBody()),
              () => {
                throw new TypeError('fetch failed');
              },
            ),
          ).connect(CODE),
        );

        expect(refusal.outcome).toBe('platform_error');
        expect(refusal.message).toBe('user info endpoint unreachable');
      });

      it('reads a non-2xx answer as a platform error', async () => {
        const refusal = await refusalOf(
          provider(
            tiktok(
              () => json(tokenBody()),
              () => json({}, 401),
            ),
          ).connect(CODE),
        );

        expect(refusal.message).toBe('user info endpoint answered 401');
      });

      it('reads a non-2xx answer that is not JSON by its status', async () => {
        const refusal = await refusalOf(
          provider(
            tiktok(
              () => json(tokenBody()),
              () => new Response('Bad Gateway', { status: 502 }),
            ),
          ).connect(CODE),
        );

        expect(refusal.message).toBe('user info endpoint answered 502');
      });

      it('names the error code a non-2xx answer carries', async () => {
        const refusal = await refusalOf(
          provider(
            tiktok(
              () => json(tokenBody()),
              () => json(userBody({}, 'access_token_invalid'), 401),
            ),
          ).connect(CODE),
        );

        expect(refusal.message).toBe('user info refused: access_token_invalid');
      });

      it('reads a body that is not JSON as a platform error', async () => {
        const refusal = await refusalOf(
          provider(
            tiktok(
              () => json(tokenBody()),
              () => new Response('not json'),
            ),
          ).connect(CODE),
        );

        expect(refusal.message).toBe('user info endpoint sent no JSON');
      });

      it('reads an error code other than ok as a platform error, naming the code', async () => {
        const refusal = await refusalOf(
          provider(
            tiktok(
              () => json(tokenBody()),
              () => json(userBody({}, 'scope_not_authorized')),
            ),
          ).connect(CODE),
        );

        expect(refusal.outcome).toBe('platform_error');
        expect(refusal.message).toBe('user info refused: scope_not_authorized');
      });

      it.each([
        [
          'no error object',
          { data: { user: { open_id: OPEN_ID, username: 'a' } } },
        ],
        ['no user', { data: {}, error: { code: 'ok' } }],
        ['no data', { error: { code: 'ok' } }],
        ['no username', userBody({ username: undefined })],
        ['an empty username', userBody({ username: '' })],
        ['a username that is not text', userBody({ username: 7 })],
        [
          'a username longer than any platform allows',
          userBody({ username: 'u'.repeat(MAX_USERNAME_LENGTH + 1) }),
        ],
      ])('reads an answer with %s as unusable', async (_label, body) => {
        const refusal = await refusalOf(
          provider(
            tiktok(
              () => json(tokenBody()),
              () => json(body),
            ),
          ).connect(CODE),
        );

        expect(refusal.outcome).toBe('platform_error');
        expect(refusal.message).toBe(
          'user info endpoint sent an unusable answer',
        );
      });

      it(`accepts a username of exactly ${MAX_USERNAME_LENGTH} characters`, async () => {
        const username = 'u'.repeat(MAX_USERNAME_LENGTH);

        await expect(
          provider(
            tiktok(
              () => json(tokenBody()),
              () => json(userBody({ username })),
            ),
          ).connect(CODE),
        ).resolves.toMatchObject({ username });
      });

      // The profile must belong to the account the token was issued for, so a mixed-up answer
      // can never attach someone else's username to this connection.
      it('refuses a profile of another account than the token names', async () => {
        const refusal = await refusalOf(
          provider(
            tiktok(
              () => json(tokenBody()),
              () => json(userBody({ open_id: 'someone-else' })),
            ),
          ).connect(CODE),
        );

        expect(refusal.message).toBe('user info is for another account');
      });
    });

    // OWASP A09:2025: a refusal's message goes to the server log, so it must never carry the
    // code, the client secret or a token.
    it('never puts a secret in any refusal message', async () => {
      const failures: Array<() => Promise<unknown>> = [
        () =>
          provider(
            tiktok(() =>
              json({ error: 'invalid_grant', error_description: CODE }),
            ),
          ).connect(CODE),
        () =>
          provider(
            tiktok(
              () => json(tokenBody()),
              () => json(userBody({}, 'access_token_invalid'), 401),
            ),
          ).connect(CODE),
        () =>
          provider(
            tiktok(
              () => json(tokenBody()),
              () => json(userBody({ open_id: 'x' })),
            ),
          ).connect(CODE),
      ];

      for (const failure of failures) {
        const { message } = await refusalOf(failure());
        for (const secret of [CODE, ACCESS, REFRESH, CONFIG.clientSecret]) {
          expect(message).not.toContain(secret);
        }
      }
    });
  });

  it('reads the real clock when none is given', async () => {
    const before = Date.now();
    const account = await new TikTokProvider(
      CONFIG,
      tiktok(() => json(tokenBody({ expires_in: 60 }))),
    ).connect(CODE);

    expect(account.accessTokenExpiresAt.getTime()).toBeGreaterThanOrEqual(
      before + 60_000,
    );
  });
});
