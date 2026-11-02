import {
  INSTAGRAM_AUTHORIZE_URL,
  instagramAuthorizationUrl,
} from './instagram-authorization.js';
import type { InstagramConfig } from './instagram-config.js';

const CONFIG: InstagramConfig = {
  appId: '1234567890',
  appSecret: 'app-secret-never-in-a-url',
  redirectUri: 'http://localhost:3000/api/social/instagram/callback',
  stateSecret: 's'.repeat(32),
};
const STATE = 'signed-state.signature';

function paramsOf(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

describe('instagramAuthorizationUrl', () => {
  it("sends the browser to Instagram's consent screen", () => {
    const url = new URL(instagramAuthorizationUrl(CONFIG, STATE));

    expect(`${url.origin}${url.pathname}`).toBe(INSTAGRAM_AUTHORIZE_URL);
    expect(INSTAGRAM_AUTHORIZE_URL).toBe(
      'https://www.instagram.com/oauth/authorize',
    );
  });

  it('carries the app, the redirect URI, the code response type and the state', () => {
    const params = paramsOf(instagramAuthorizationUrl(CONFIG, STATE));

    expect(params.get('client_id')).toBe('1234567890');
    expect(params.get('redirect_uri')).toBe(CONFIG.redirectUri);
    expect(params.get('response_type')).toBe('code');
    expect(params.get('state')).toBe(STATE);
  });

  it('asks for exactly the basic profile and the insights permissions', () => {
    const params = paramsOf(instagramAuthorizationUrl(CONFIG, STATE));

    expect(params.get('scope')).toBe(
      'instagram_business_basic,instagram_business_manage_insights',
    );
  });

  it('never puts the app secret in the URL', () => {
    const url = instagramAuthorizationUrl(CONFIG, STATE);

    expect(url).not.toContain(CONFIG.appSecret);
    expect(paramsOf(url).has('client_secret')).toBe(false);
  });

  it('keeps a redirect URI that has a query of its own intact', () => {
    const redirectUri = 'https://staging.example.com/api/cb?env=staging&v=2';

    const params = paramsOf(
      instagramAuthorizationUrl({ ...CONFIG, redirectUri }, STATE),
    );

    expect(params.get('redirect_uri')).toBe(redirectUri);
    expect(params.get('v')).toBeNull();
  });
});
