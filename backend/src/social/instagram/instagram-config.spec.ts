import { instagramConfig } from './instagram-config.js';

const ENV = {
  INSTAGRAM_APP_ID: '1234567890',
  INSTAGRAM_APP_SECRET: 'app-secret',
  INSTAGRAM_REDIRECT_URI: 'http://localhost:3000/api/social/instagram/callback',
};

describe('instagramConfig', () => {
  // The state secret is the shared OAuthStateSigner's (#127), so the app alone is read here.
  it('reads the Instagram app from the environment', () => {
    expect(instagramConfig(ENV)).toEqual({
      appId: '1234567890',
      appSecret: 'app-secret',
      redirectUri: 'http://localhost:3000/api/social/instagram/callback',
    });
  });

  it('trims the spaces a pasted value brings with it', () => {
    expect(
      instagramConfig({
        ...ENV,
        INSTAGRAM_APP_ID: ' 1234567890 ',
        INSTAGRAM_APP_SECRET: '\tapp-secret\n',
      }),
    ).toMatchObject({ appId: '1234567890', appSecret: 'app-secret' });
  });

  it.each([
    'INSTAGRAM_APP_ID',
    'INSTAGRAM_APP_SECRET',
    'INSTAGRAM_REDIRECT_URI',
  ])('is not configured while %s is missing', (name) => {
    expect(instagramConfig({ ...ENV, [name]: undefined })).toBeUndefined();
  });

  it('is not configured while a value is only spaces', () => {
    expect(
      instagramConfig({ ...ENV, INSTAGRAM_APP_SECRET: '   ' }),
    ).toBeUndefined();
  });
});
