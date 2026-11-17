import type { InstagramConfig } from './instagram-config.js';

export const INSTAGRAM_TOKEN_URL =
  'https://api.instagram.com/oauth/access_token';
export const INSTAGRAM_GRAPH_URL = 'https://graph.instagram.com';
const API_VERSION = 'v23.0';

// The creator waits on these calls; a stalled Instagram should fail the connect, not hold it.
export const INSTAGRAM_TIMEOUT_MS = 5000;

// How Instagram answers an account that is not a tester of an app in development mode.
const NOT_TESTER_MESSAGE = 'Insufficient developer role';

export type InstagramFailure = 'not_tester' | 'platform_error';

// Why talking to Instagram failed, in words safe for the server log: the step that failed,
// never the code, the app secret, a token or Instagram's response body.
export class InstagramApiError extends Error {
  override readonly name = 'InstagramApiError';

  constructor(
    readonly failure: InstagramFailure,
    message: string,
  ) {
    super(message);
  }
}

export interface InstagramAccount {
  // Instagram's id for the account, kept as text so no digit is lost.
  platformUserId: string;
  username: string;
  // BUSINESS or MEDIA_CREATOR for a Professional account.
  accountType: string;
  // Long-lived, about 60 days.
  accessToken: string;
  expiresAt: Date;
}

type Json = Record<string, unknown> | null;

function fail(message: string): never {
  throw new InstagramApiError('platform_error', message);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

// The server-side half of Instagram API with Instagram Login: the app secret and every token
// only travel here, server to Instagram, never through the browser. `fetch` is injected so
// tests stand in for Instagram.
export class InstagramClient {
  constructor(
    private readonly config: Pick<
      InstagramConfig,
      'appId' | 'appSecret' | 'redirectUri'
    >,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async connect(code: string): Promise<InstagramAccount> {
    const shortToken = await this.exchangeCode(code);
    // Both need only the short-lived token, so they run side by side: about 260 ms less per
    // connect than one after the other, as measured in the review of #126.
    const [{ accessToken, expiresAt }, profile] = await Promise.all([
      this.longLived(shortToken),
      this.profile(shortToken),
    ]);
    return { ...profile, accessToken, expiresAt };
  }

  private async call(
    step: string,
    url: string,
    init: RequestInit = {},
  ): Promise<Json> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        ...init,
        // Instagram never redirects these; following one would send the secret elsewhere.
        redirect: 'error',
        signal: AbortSignal.timeout(INSTAGRAM_TIMEOUT_MS),
      });
    } catch {
      fail(`${step}: Instagram unreachable`);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      fail(`${step}: Instagram sent no JSON`);
    }

    if (!response.ok) {
      const message = (body as { error_message?: unknown } | null)
        ?.error_message;
      if (typeof message === 'string' && message.includes(NOT_TESTER_MESSAGE)) {
        throw new InstagramApiError(
          'not_tester',
          `${step}: the account is not a tester of the app`,
        );
      }
      fail(`${step}: Instagram answered ${response.status}`);
    }
    return body as Json;
  }

  private async exchangeCode(code: string): Promise<string> {
    const body = await this.call('code exchange', INSTAGRAM_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.appId,
        client_secret: this.config.appSecret,
        grant_type: 'authorization_code',
        redirect_uri: this.config.redirectUri,
        code,
      }).toString(),
    });
    // Documented as { data: [{ access_token, user_id }] }; also seen without the wrapper.
    const entry = (
      Array.isArray(body?.data) ? (body.data as unknown[])[0] : body
    ) as Json | undefined;
    const token = entry?.access_token;
    if (!nonEmpty(token)) {
      fail('code exchange: Instagram sent no token');
    }
    return token;
  }

  private async longLived(
    shortToken: string,
  ): Promise<{ accessToken: string; expiresAt: Date }> {
    const params = new URLSearchParams({
      grant_type: 'ig_exchange_token',
      client_secret: this.config.appSecret,
      access_token: shortToken,
    });
    const body = await this.call(
      'long-lived token',
      `${INSTAGRAM_GRAPH_URL}/access_token?${params.toString()}`,
    );
    const accessToken = body?.access_token;
    const expiresIn = body?.expires_in;
    if (!nonEmpty(accessToken) || typeof expiresIn !== 'number') {
      fail('long-lived token: Instagram sent no token or lifetime');
    }
    return {
      accessToken,
      expiresAt: new Date(this.now() + expiresIn * 1000),
    };
  }

  private async profile(
    accessToken: string,
  ): Promise<
    Pick<InstagramAccount, 'platformUserId' | 'username' | 'accountType'>
  > {
    const params = new URLSearchParams({
      fields: 'user_id,username,account_type',
      access_token: accessToken,
    });
    const body = await this.call(
      'profile',
      `${INSTAGRAM_GRAPH_URL}/${API_VERSION}/me?${params.toString()}`,
    );
    // Instagram ids are 17 digits, past what a JSON number holds exactly, so only text is
    // trusted: a number has already lost digits by the time it is read.
    const platformUserId = body?.user_id;
    const username = body?.username;
    const accountType = body?.account_type;
    if (
      !nonEmpty(platformUserId) ||
      !nonEmpty(username) ||
      !nonEmpty(accountType)
    ) {
      fail('profile: Instagram sent no id, username or account type');
    }
    return { platformUserId, username, accountType };
  }
}
