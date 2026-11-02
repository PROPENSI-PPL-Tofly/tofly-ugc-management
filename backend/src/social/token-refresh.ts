import type { RefreshedTokens } from './social-token-store.js';

// Refreshing a connected account's access token before a performance sync (PBI-27). Each
// platform refreshes its own way (TikTok with its refresh token, 27.3; Instagram with the
// long-lived token itself, 27.2) behind this one interface.

export interface TokenRefresher {
  /** New tokens for the account; rejects with RefreshRefused or RefreshUnavailable. */
  refresh(
    refreshToken: string,
    deadline: AbortSignal,
  ): Promise<RefreshedTokens>;
}

/**
 * The platform refused the refresh token: it will never work again, so the account is
 * disconnected (PRD 27: "Refresh gagal → akun diputus"). The message is for the log only.
 */
export class RefreshRefused extends Error {
  override readonly name = 'RefreshRefused';
}

/**
 * The platform could not refresh right now (unreachable, too slow, failing, rate limited). The
 * account stays connected and its links are tried again on the next run.
 */
export class RefreshUnavailable extends Error {
  override readonly name = 'RefreshUnavailable';
}
