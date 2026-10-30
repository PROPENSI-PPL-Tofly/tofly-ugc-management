import {
  logSafeName,
  PlatformRefusal,
  type ConnectError,
  type PlatformAccount,
  type SocialOAuthProvider,
} from '../ports.js';
import type { TikTokConfig } from './tiktok-config.js';

export const TIKTOK_AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/';
export const TIKTOK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
export const TIKTOK_USER_INFO_URL = 'https://open.tiktokapis.com/v2/user/info/';

/**
 * The creator waits on the whole connect, so this bounds both calls together: a stalled TikTok
 * fails the connect after this long, however the time splits between the two.
 */
export const TIKTOK_TIMEOUT_MS = 5000;

/** PBI-19 scopes: who the creator is, their handle, and the videos 27.3 reads metrics of. */
export const REQUESTED_SCOPES = [
  'user.info.basic',
  'user.info.profile',
  'video.list',
] as const;

/** TikTok handles are at most 24 characters; anything far longer is not one. */
export const MAX_USERNAME_LENGTH = 64;

/**
 * The `error` values TikTok's callback carries, as the Performa page reads them. Login Kit's
 * documentation names none, so this table holds what TikTok is known to send and grows with
 * what the sandbox test shows (e.g. the error for an account that is not a target user).
 * Anything unlisted is a platform error.
 */
const CALLBACK_ERRORS: Readonly<Record<string, ConnectError>> = {
  access_denied: 'cancelled',
};

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function isLifetime(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function platformError(reason: string): PlatformRefusal {
  return new PlatformRefusal('platform_error', reason);
}

interface TokenGrant {
  accessToken: string;
  accessSeconds: number;
  openId: string;
  refreshToken: string;
  refreshSeconds: number;
}

interface Answer {
  ok: boolean;
  status: number;
  body: Json;
}

/**
 * TikTok Login Kit for Web (v2) as a SocialOAuthProvider (PBI-19, 19.2). The client secret and
 * the tokens only ever travel server to TikTok. `fetch` and the clock are injected so tests
 * stand in for TikTok and pin the token expiry.
 */
export class TikTokProvider implements SocialOAuthProvider {
  readonly platform = 'tiktok' as const;

  constructor(
    private readonly config: TikTokConfig,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {}

  authorizationUrl(state: string): string {
    const url = new URL(TIKTOK_AUTHORIZE_URL);
    url.search = new URLSearchParams({
      client_key: this.config.clientKey,
      response_type: 'code',
      scope: REQUESTED_SCOPES.join(','),
      redirect_uri: this.config.redirectUri,
      state,
    }).toString();
    return url.toString();
  }

  callbackError(error: string): ConnectError {
    return Object.hasOwn(CALLBACK_ERRORS, error)
      ? CALLBACK_ERRORS[error]
      : 'platform_error';
  }

  async connect(code: string): Promise<PlatformAccount> {
    // One deadline for both calls (review #127): a timeout per call let them add up to twice this.
    const deadline = AbortSignal.timeout(TIKTOK_TIMEOUT_MS);
    const grant = await this.exchange(code, deadline);
    const username = await this.username(grant, deadline);
    const now = this.now().getTime();
    return {
      platform: 'tiktok',
      platformUserId: grant.openId,
      username,
      accessToken: grant.accessToken,
      accessTokenExpiresAt: new Date(now + grant.accessSeconds * 1000),
      refreshToken: grant.refreshToken,
      refreshTokenExpiresAt: new Date(now + grant.refreshSeconds * 1000),
    };
  }

  /** POST /v2/oauth/token/ with grant_type=authorization_code. */
  private async exchange(
    code: string,
    deadline: AbortSignal,
  ): Promise<TokenGrant> {
    const label = 'token endpoint';
    const { ok, status, body } = await this.call(
      label,
      TIKTOK_TOKEN_URL,
      deadline,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
        },
        body: new URLSearchParams({
          client_key: this.config.clientKey,
          client_secret: this.config.clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: this.config.redirectUri,
        }).toString(),
      },
    );

    if (body.error !== undefined) {
      throw platformError(`${label} refused: ${logSafeName(body.error)}`);
    }
    if (!ok) {
      throw platformError(`${label} answered ${status}`);
    }

    const {
      access_token,
      expires_in,
      open_id,
      refresh_token,
      refresh_expires_in,
      scope,
    } = body;
    if (
      !isText(access_token) ||
      !isLifetime(expires_in) ||
      !isText(open_id) ||
      !isText(refresh_token) ||
      !isLifetime(refresh_expires_in) ||
      !isText(scope)
    ) {
      throw platformError(`${label} sent an unusable answer`);
    }

    // A creator who unticks a scope connects an account whose performance cannot be read.
    // It lands as `cancelled` ("Koneksi dibatalkan") on purpose (review #127): the creator did
    // not finish granting what Tofly asked for, and Hubungkan again is the way out, as after a
    // refused consent. The PRD has no message of its own for a partial consent.
    const granted = scope.split(',');
    const missing = REQUESTED_SCOPES.find(
      (wanted) => !granted.includes(wanted),
    );
    if (missing) {
      throw new PlatformRefusal('cancelled', `scope not granted: ${missing}`);
    }

    return {
      accessToken: access_token,
      accessSeconds: expires_in,
      openId: open_id,
      refreshToken: refresh_token,
      refreshSeconds: refresh_expires_in,
    };
  }

  /** GET /v2/user/info/: the handle needs the user.info.profile scope. */
  private async username(
    grant: TokenGrant,
    deadline: AbortSignal,
  ): Promise<string> {
    const label = 'user info endpoint';
    const url = new URL(TIKTOK_USER_INFO_URL);
    url.searchParams.set('fields', 'open_id,username');
    const { ok, status, body } = await this.call(
      label,
      url.toString(),
      deadline,
      {
        method: 'GET',
        headers: {
          authorization: `Bearer ${grant.accessToken}`,
          accept: 'application/json',
        },
      },
    );

    const { error, data } = body;
    if (isRecord(error) && error.code !== 'ok') {
      throw platformError(`user info refused: ${logSafeName(error.code)}`);
    }
    if (!ok) {
      throw platformError(`${label} answered ${status}`);
    }

    const user = isRecord(data) ? data.user : undefined;
    const username = isRecord(user) ? user.username : undefined;
    if (
      !isRecord(error) ||
      !isRecord(user) ||
      !isText(username) ||
      username.length > MAX_USERNAME_LENGTH
    ) {
      throw platformError(`${label} sent an unusable answer`);
    }
    if (user.open_id !== grant.openId) {
      throw platformError('user info is for another account');
    }
    return username;
  }

  /**
   * One call to TikTok: no redirects (one would carry the secret or the token to whatever host
   * it names) and cut off at the connect's deadline. Every failure becomes a refusal whose message names only the
   * endpoint and what went wrong.
   */
  private async call(
    label: string,
    url: string,
    deadline: AbortSignal,
    init: RequestInit,
  ): Promise<Answer> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        ...init,
        redirect: 'error',
        signal: deadline,
      });
    } catch {
      throw platformError(`${label} unreachable`);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw platformError(
        response.ok
          ? `${label} sent no JSON`
          : `${label} answered ${response.status}`,
      );
    }
    return {
      ok: response.ok,
      status: response.status,
      body: isRecord(body) ? body : {},
    };
  }
}
