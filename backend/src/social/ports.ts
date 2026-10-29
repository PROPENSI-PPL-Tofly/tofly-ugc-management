// What a social connect (PBI-19) needs from each platform. Instagram (19.1) and TikTok (19.2)
// each implement SocialOAuthProvider; the connect flow only ever talks to this interface, so a
// third platform is one more provider, not a change to the flow (Open/Closed, Strategy).

import type { SocialPlatform } from './oauth-state.js';

/**
 * Why a connect ended back on the Performa page without connecting. The page (19.4) owns the
 * wording; these are the PRD's failure messages, plus `connect_failed` for a callback that did
 * not come from this creator's own attempt.
 */
export type ConnectError =
  | 'cancelled'
  | 'not_tester'
  | 'account_taken'
  | 'platform_error'
  | 'connect_failed';

/**
 * A platform account the creator has just authorized, with its tokens. The tokens are secrets:
 * they go to storage encrypted and never to the browser or the log.
 */
export interface PlatformAccount {
  platform: SocialPlatform;
  /** The platform's stable id for the account (TikTok's `open_id`). */
  platformUserId: string;
  /** The handle the platform reports, which replaces the one typed at Tambah Creator. */
  username: string;
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string | null;
  refreshTokenExpiresAt: Date | null;
}

/** One platform's half of the OAuth authorization code flow (RFC 6749 §4.1). */
export interface SocialOAuthProvider {
  readonly platform: SocialPlatform;
  /** Where to send the creator to log in and consent, carrying the signed state. */
  authorizationUrl(state: string): string;
  /** What the platform's `error` callback parameter means for the creator. */
  callbackError(error: string): ConnectError;
  /** Trades the authorization code for the account and its tokens; rejects with PlatformRefusal. */
  connect(code: string): Promise<PlatformAccount>;
}

/**
 * A platform call that did not end in an account. The outcome is what the creator is told;
 * the message is for the server log, so it never carries a code, a secret or a token.
 */
export class PlatformRefusal extends Error {
  override readonly name = 'PlatformRefusal';

  constructor(
    readonly outcome: ConnectError,
    reason: string,
  ) {
    super(reason);
  }
}
