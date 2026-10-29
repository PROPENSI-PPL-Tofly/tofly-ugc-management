import type { InstagramConfig } from './instagram-config.js';

export const INSTAGRAM_AUTHORIZE_URL =
  'https://www.instagram.com/oauth/authorize';

// PRD 3.1: the profile (username and account type) and the numbers of the creator's own
// videos. Nothing that posts, comments or messages on their behalf.
const SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_insights',
];

// Where GET /social/instagram/connect sends the browser. Only the app id and the redirect URI
// leave the server; the app secret is used later, server to Instagram, in the code exchange.
export function instagramAuthorizationUrl(
  config: Pick<InstagramConfig, 'appId' | 'redirectUri'>,
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: SCOPES.join(','),
    state,
  });
  return `${INSTAGRAM_AUTHORIZE_URL}?${params.toString()}`;
}
