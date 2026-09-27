import {
  googleOAuthConfig,
  requireGoogleConfigInProduction,
} from './google-config.js';

const ENV = {
  GOOGLE_CLIENT_ID: 'client-123.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'secret-xyz',
  GOOGLE_REDIRECT_URI: 'http://localhost:3000/api/auth/google/callback',
};

describe('googleOAuthConfig', () => {
  it('reads the OAuth client from the environment, trimmed', () => {
    expect(
      googleOAuthConfig({
        ...ENV,
        GOOGLE_CLIENT_ID: `  ${ENV.GOOGLE_CLIENT_ID}\n`,
      }),
    ).toEqual({
      clientId: ENV.GOOGLE_CLIENT_ID,
      clientSecret: ENV.GOOGLE_CLIENT_SECRET,
      redirectUri: ENV.GOOGLE_REDIRECT_URI,
    });
  });

  it.each(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'])(
    'is not configured while %s is missing or blank',
    (name) => {
      expect(googleOAuthConfig({ ...ENV, [name]: undefined })).toBeUndefined();
      expect(googleOAuthConfig({ ...ENV, [name]: '   ' })).toBeUndefined();
    },
  );
});

describe('requireGoogleConfigInProduction', () => {
  it('lets a configured production boot', () => {
    expect(() =>
      requireGoogleConfigInProduction({ ...ENV, NODE_ENV: 'production' }),
    ).not.toThrow();
  });

  it('stops a production boot that has no way to sign anyone in, naming what is missing', () => {
    expect(() =>
      requireGoogleConfigInProduction({
        ...ENV,
        GOOGLE_CLIENT_SECRET: '',
        GOOGLE_REDIRECT_URI: undefined,
        NODE_ENV: 'production',
      }),
    ).toThrow(
      'Missing required env var: GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI',
    );
  });

  it('lets development and tests boot without Google', () => {
    expect(() => requireGoogleConfigInProduction({})).not.toThrow();
    expect(() =>
      requireGoogleConfigInProduction({ NODE_ENV: 'test' }),
    ).not.toThrow();
  });
});
