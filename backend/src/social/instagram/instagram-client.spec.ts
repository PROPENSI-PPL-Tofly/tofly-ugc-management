import {
  INSTAGRAM_GRAPH_URL,
  INSTAGRAM_TOKEN_URL,
  InstagramApiError,
  InstagramClient,
} from './instagram-client.js';

const CONFIG = {
  appId: '1234567890',
  appSecret: 'app-secret-xyz',
  redirectUri: 'http://localhost:3000/api/social/instagram/callback',
};
const CODE = 'AQBx-instagram-code';
const SHORT_TOKEN = 'IGAA-short-lived-token';
const LONG_TOKEN = 'IGAA-long-lived-token';
const NOW = Date.UTC(2026, 9, 29, 10, 0, 0);
const SIXTY_DAYS_S = 5_184_000;

type Reply = { status?: number; body?: unknown; raw?: string } | 'network';

interface Routes {
  token?: Reply;
  longLived?: Reply;
  profile?: Reply;
}

const OK: Required<Routes> = {
  token: {
    body: {
      data: [
        {
          access_token: SHORT_TOKEN,
          user_id: '1784',
          permissions: 'instagram_business_basic',
        },
      ],
    },
  },
  longLived: {
    body: {
      access_token: LONG_TOKEN,
      token_type: 'bearer',
      expires_in: SIXTY_DAYS_S,
    },
  },
  profile: {
    body: {
      user_id: '17841400000000000',
      username: 'rangga.creates',
      account_type: 'MEDIA_CREATOR',
    },
  },
};

function routeOf(url: string): keyof Routes {
  if (url === INSTAGRAM_TOKEN_URL) return 'token';
  if (url.startsWith(`${INSTAGRAM_GRAPH_URL}/access_token?`))
    return 'longLived';
  return 'profile';
}

// Stands in for Instagram: answers each of the three calls from `routes`, the happy path by default.
function fakeFetch(routes: Routes = {}) {
  return vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const reply = { ...OK, ...routes }[routeOf(String(input))];
    if (reply === 'network') {
      throw new TypeError('fetch failed');
    }
    const text = reply.raw ?? JSON.stringify(reply.body);
    return new Response(text, { status: reply.status ?? 200 });
  });
}

function clientWith(fetchImpl: ReturnType<typeof fakeFetch>) {
  return new InstagramClient(
    CONFIG,
    fetchImpl as unknown as typeof fetch,
    () => NOW,
  );
}

async function failureOf(routes: Routes): Promise<InstagramApiError> {
  const error = await clientWith(fakeFetch(routes))
    .connect(CODE)
    .catch((e: unknown) => e);
  expect(error).toBeInstanceOf(InstagramApiError);
  return error as InstagramApiError;
}

describe('InstagramClient.connect', () => {
  it('reads the connected account with a long-lived token', async () => {
    const account = await clientWith(fakeFetch()).connect(CODE);

    expect(account).toEqual({
      platformUserId: '17841400000000000',
      username: 'rangga.creates',
      accountType: 'MEDIA_CREATOR',
      accessToken: LONG_TOKEN,
      expiresAt: new Date(NOW + SIXTY_DAYS_S * 1000),
    });
  });

  it('posts the code with the app secret to the token endpoint, server to Instagram', async () => {
    const fetchImpl = fakeFetch();

    await clientWith(fetchImpl).connect(CODE);

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.instagram.com/oauth/access_token');
    expect(init.method).toBe('POST');
    expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toEqual({
      client_id: CONFIG.appId,
      client_secret: CONFIG.appSecret,
      grant_type: 'authorization_code',
      redirect_uri: CONFIG.redirectUri,
      code: CODE,
    });
  });

  it('swaps the short-lived token for a long-lived one', async () => {
    const fetchImpl = fakeFetch();

    await clientWith(fetchImpl).connect(CODE);

    const url = new URL(String(fetchImpl.mock.calls[1][0]));
    expect(`${url.origin}${url.pathname}`).toBe(
      'https://graph.instagram.com/access_token',
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      grant_type: 'ig_exchange_token',
      client_secret: CONFIG.appSecret,
      access_token: SHORT_TOKEN,
    });
  });

  it('reads the id, username and account type with the short-lived token', async () => {
    const fetchImpl = fakeFetch();

    await clientWith(fetchImpl).connect(CODE);

    const url = fetchImpl.mock.calls
      .map(([input]) => new URL(String(input)))
      .find((called) => /^\/v\d+\.\d+\/me$/.test(called.pathname))!;
    expect(url.searchParams.get('fields')).toBe(
      'user_id,username,account_type',
    );
    expect(url.searchParams.get('access_token')).toBe(SHORT_TOKEN);
  });

  it('asks for the long-lived token and the profile at the same time', async () => {
    // Each answer takes a moment, so calls made one after another never overlap.
    const answer = fakeFetch();
    let open = 0;
    let mostOpen = 0;
    const fetchImpl = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        open += 1;
        mostOpen = Math.max(mostOpen, open);
        await new Promise((resolve) => setTimeout(resolve, 5));
        open -= 1;
        return answer(input, init);
      },
    );

    await clientWith(
      fetchImpl as unknown as ReturnType<typeof fakeFetch>,
    ).connect(CODE);

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(mostOpen).toBe(2);
  });

  it('accepts the short-lived token answered without the data wrapper', async () => {
    const account = await clientWith(
      fakeFetch({
        token: { body: { access_token: SHORT_TOKEN, user_id: 1784 } },
      }),
    ).connect(CODE);

    expect(account.accessToken).toBe(LONG_TOKEN);
  });

  it('refuses an account id sent as a number, which has already lost digits when read', async () => {
    // 17 digits is past Number.MAX_SAFE_INTEGER: JSON.parse reads it as ...056, not ...057.
    const error = await failureOf({
      profile: {
        raw: '{"user_id":17841400008460057,"username":"rangga.creates","account_type":"BUSINESS"}',
      },
    });

    expect(error.failure).toBe('platform_error');
  });

  it('never follows a redirect and never waits without a limit', async () => {
    const fetchImpl = fakeFetch();

    await clientWith(fetchImpl).connect(CODE);

    for (const [, init] of fetchImpl.mock.calls as [string, RequestInit][]) {
      expect(init.redirect).toBe('error');
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it('reports an account that is not a tester of the app as not_tester', async () => {
    const error = await failureOf({
      token: {
        status: 400,
        body: {
          error_type: 'OAuthException',
          code: 400,
          error_message: 'Insufficient developer role',
        },
      },
    });

    expect(error.failure).toBe('not_tester');
  });

  it.each<[string, Routes]>([
    [
      'the token endpoint refuses the code',
      {
        token: {
          status: 400,
          body: {
            error_type: 'OAuthException',
            error_message: 'Matching code was not found or was already used',
          },
        },
      },
    ],
    ['the token endpoint is unreachable', { token: 'network' }],
    ['the token endpoint answers with no JSON', { token: { raw: '<html>' } }],
    ['the token endpoint sends no token', { token: { body: { data: [] } } }],
    ['the long-lived swap fails', { longLived: { status: 500, body: {} } }],
    ['the long-lived swap is unreachable', { longLived: 'network' }],
    [
      'the long-lived token comes without its lifetime',
      { longLived: { body: { access_token: LONG_TOKEN } } },
    ],
    ['the profile cannot be read', { profile: { status: 400, body: {} } }],
    [
      'the profile has no username',
      { profile: { body: { user_id: '1', account_type: 'BUSINESS' } } },
    ],
    [
      'the profile has no id',
      {
        profile: { body: { username: 'rangga', account_type: 'BUSINESS' } },
      },
    ],
  ])('reports a platform_error when %s', async (_label, routes) => {
    expect((await failureOf(routes)).failure).toBe('platform_error');
  });

  it('makes no further call once the code exchange has failed', async () => {
    const fetchImpl = fakeFetch({ token: { status: 400, body: {} } });

    await clientWith(fetchImpl)
      .connect(CODE)
      .catch(() => undefined);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each<[string, Routes]>([
    [
      'the code exchange',
      { token: { status: 400, body: { error_message: SHORT_TOKEN } } },
    ],
    ['the long-lived swap', { longLived: { status: 500, body: {} } }],
    ['the profile', { profile: { status: 400, body: {} } }],
  ])(
    'keeps the secret, the code and every token out of the error from %s',
    async (_label, routes) => {
      const { message } = await failureOf(routes);

      for (const secret of [CONFIG.appSecret, CODE, SHORT_TOKEN, LONG_TOKEN]) {
        expect(message).not.toContain(secret);
      }
    },
  );
});
