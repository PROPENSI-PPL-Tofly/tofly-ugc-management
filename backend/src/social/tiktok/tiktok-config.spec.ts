import { tiktokConfig } from './tiktok-config.js';

const COMPLETE = {
  TIKTOK_CLIENT_KEY: 'sbawexamplekey',
  TIKTOK_CLIENT_SECRET: 'example-secret',
  TIKTOK_REDIRECT_URI: 'https://staging.tofly.id/api/social/tiktok/callback',
};

describe('tiktokConfig', () => {
  it('reads the TikTok app from the environment', () => {
    expect(tiktokConfig(COMPLETE)).toEqual({
      clientKey: 'sbawexamplekey',
      clientSecret: 'example-secret',
      redirectUri: 'https://staging.tofly.id/api/social/tiktok/callback',
    });
  });

  it('trims stray whitespace a secret manager may keep', () => {
    expect(
      tiktokConfig({
        TIKTOK_CLIENT_KEY: ' sbawexamplekey\n',
        TIKTOK_CLIENT_SECRET: '\texample-secret ',
        TIKTOK_REDIRECT_URI:
          ' https://staging.tofly.id/api/social/tiktok/callback ',
      }),
    ).toEqual({
      clientKey: 'sbawexamplekey',
      clientSecret: 'example-secret',
      redirectUri: 'https://staging.tofly.id/api/social/tiktok/callback',
    });
  });

  it.each(Object.keys(COMPLETE))('is undefined while %s is missing', (name) => {
    expect(tiktokConfig({ ...COMPLETE, [name]: undefined })).toBeUndefined();
  });

  it.each(Object.keys(COMPLETE))('is undefined while %s is blank', (name) => {
    expect(tiktokConfig({ ...COMPLETE, [name]: '   ' })).toBeUndefined();
  });

  // TikTok only redirects to an absolute https URI (Login Kit for Web), and a plain-http
  // callback would carry the authorization code in the clear (OWASP A04:2025).
  it.each([
    ['plain http', 'http://staging.tofly.id/api/social/tiktok/callback'],
    ['not a URL', 'staging.tofly.id/callback'],
    ['carrying a fragment', 'https://staging.tofly.id/callback#x'],
    ['carrying a query string', 'https://staging.tofly.id/callback?env=dev'],
  ])('is undefined when the redirect URI is %s', (_label, uri) => {
    expect(
      tiktokConfig({ ...COMPLETE, TIKTOK_REDIRECT_URI: uri }),
    ).toBeUndefined();
  });
});
