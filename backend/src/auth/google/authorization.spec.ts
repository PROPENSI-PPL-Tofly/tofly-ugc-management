import { authorizationUrl, GOOGLE_AUTHORIZE_URL } from './authorization.js';
import { pkceChallenge, type OAuthFlow } from './oauth-flow.js';

const CONFIG = {
  clientId: 'client-123.apps.googleusercontent.com',
  clientSecret: 'never-in-the-url',
  redirectUri: 'http://localhost:3000/api/auth/google/callback',
};
const FLOW: OAuthFlow = {
  state: 's'.repeat(43),
  nonce: 'n'.repeat(43),
  verifier: 'v'.repeat(43),
};

describe('authorizationUrl', () => {
  const url = new URL(authorizationUrl(CONFIG, FLOW));

  it("points at Google's authorization endpoint", () => {
    expect(`${url.origin}${url.pathname}`).toBe(GOOGLE_AUTHORIZE_URL);
    expect(GOOGLE_AUTHORIZE_URL).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
  });

  it('asks for an authorization code with PKCE S256, the state and the nonce', () => {
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: CONFIG.clientId,
      redirect_uri: CONFIG.redirectUri,
      response_type: 'code',
      scope: 'openid email',
      state: FLOW.state,
      nonce: FLOW.nonce,
      code_challenge: pkceChallenge(FLOW.verifier),
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
  });

  it('never sends the PKCE verifier or the client secret to the browser', () => {
    expect(url.href).not.toContain(FLOW.verifier);
    expect(url.href).not.toContain(CONFIG.clientSecret);
  });
});
