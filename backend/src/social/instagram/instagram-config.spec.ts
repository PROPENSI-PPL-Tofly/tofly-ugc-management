import {
  instagramConfig,
  MIN_STATE_SECRET_LENGTH,
} from './instagram-config.js';

const STATE_SECRET = 's'.repeat(MIN_STATE_SECRET_LENGTH);

const ENV = {
  INSTAGRAM_APP_ID: '1234567890',
  INSTAGRAM_APP_SECRET: 'app-secret',
  INSTAGRAM_REDIRECT_URI: 'http://localhost:3000/api/social/instagram/callback',
  SOCIAL_STATE_SECRET: STATE_SECRET,
};

describe('instagramConfig', () => {
  it('reads the Instagram app and the state secret from the environment', () => {
    expect(instagramConfig(ENV)).toEqual({
      appId: '1234567890',
      appSecret: 'app-secret',
      redirectUri: 'http://localhost:3000/api/social/instagram/callback',
      stateSecret: STATE_SECRET,
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
    'SOCIAL_STATE_SECRET',
  ])('is not configured while %s is missing', (name) => {
    expect(instagramConfig({ ...ENV, [name]: undefined })).toBeUndefined();
  });

  it('is not configured while a value is only spaces', () => {
    expect(
      instagramConfig({ ...ENV, INSTAGRAM_APP_SECRET: '   ' }),
    ).toBeUndefined();
  });

  it('refuses a state secret one character too short to sign with', () => {
    expect(
      instagramConfig({
        ...ENV,
        SOCIAL_STATE_SECRET: 's'.repeat(MIN_STATE_SECRET_LENGTH - 1),
      }),
    ).toBeUndefined();
  });

  it('accepts a state secret of exactly the minimum length', () => {
    expect(instagramConfig(ENV)?.stateSecret).toHaveLength(
      MIN_STATE_SECRET_LENGTH,
    );
  });
});
