import { pkceChallenge, type OAuthFlow } from './oauth-flow.js';

export const GOOGLE_AUTHORIZE_URL =
  'https://accounts.google.com/o/oauth2/v2/auth';

/** The registered OAuth client (Google Auth Platform → Clients, type Web application). */
export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  /** Must match a redirect URI registered on the client exactly. */
  redirectUri: string;
}

/**
 * Where GET /auth/google sends the browser. Only the email is asked for: the whitelist, not
 * Google, decides who gets in and with which role (PRD 3.1). prompt=select_account lets
 * someone with several Google accounts pick the one their admin whitelisted.
 */
export function authorizationUrl(
  config: GoogleOAuthConfig,
  flow: OAuthFlow,
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: 'openid email',
    state: flow.state,
    nonce: flow.nonce,
    code_challenge: pkceChallenge(flow.verifier),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  return `${GOOGLE_AUTHORIZE_URL}?${params.toString()}`;
}
