import { PlatformRefusal } from '../ports.js';
import { InstagramApiError, type InstagramAccount } from './instagram-client.js';
import { InstagramProvider } from './instagram-provider.js';

const CONFIG = {
  appId: '1234567890',
  appSecret: 'app-secret-xyz',
  redirectUri: 'http://localhost:3000/api/social/instagram/callback',
};
const CODE = 'AQBx-instagram-code';
const EXPIRES_AT = new Date(Date.UTC(2026, 11, 28, 10, 0, 0));

const ACCOUNT: InstagramAccount = {
  platformUserId: '17841400000000000',
  username: 'rangga.creates',
  accountType: 'MEDIA_CREATOR',
  accessToken: 'IGAA-long-lived-token',
  expiresAt: EXPIRES_AT,
};

// Stands in for InstagramClient, whose own spec covers Instagram's HTTP answers.
function providerWith(answer: () => Promise<InstagramAccount>) {
  const connect = vi.fn(answer);
  return { provider: new InstagramProvider(CONFIG, { connect }), connect };
}

async function refusalOf(
  answer: () => Promise<InstagramAccount>,
): Promise<PlatformRefusal> {
  const thrown = await providerWith(answer)
    .provider.connect(CODE)
    .catch((e: unknown) => e);
  expect(thrown).toBeInstanceOf(PlatformRefusal);
  return thrown as PlatformRefusal;
}

describe('InstagramProvider', () => {
  it('connects Instagram', () => {
    expect(providerWith(() => Promise.resolve(ACCOUNT)).provider.platform).toBe(
      'instagram',
    );
  });

  describe('authorizationUrl', () => {
    it("sends the creator to Instagram's consent screen with the signed state", () => {
      const url = new URL(
        providerWith(() => Promise.resolve(ACCOUNT)).provider.authorizationUrl(
          'signed.state',
        ),
      );

      expect(`${url.origin}${url.pathname}`).toBe(
        'https://www.instagram.com/oauth/authorize',
      );
      expect(url.searchParams.get('client_id')).toBe(CONFIG.appId);
      expect(url.searchParams.get('state')).toBe('signed.state');
      expect(url.searchParams.get('scope')).toBe(
        'instagram_business_basic,instagram_business_manage_insights',
      );
    });
  });

  describe('callbackError', () => {
    const { provider } = providerWith(() => Promise.resolve(ACCOUNT));

    it('reads a refused consent as cancelled', () => {
      expect(provider.callbackError('access_denied')).toBe('cancelled');
    });

    it.each(['server_error', 'temporarily_unavailable', ''])(
      'reads any other error (%j) as a platform error',
      (error) => {
        expect(provider.callbackError(error)).toBe('platform_error');
      },
    );

    it('is not fooled by a name inherited from Object', () => {
      expect(provider.callbackError('toString')).toBe('platform_error');
    });
  });

  describe('connect', () => {
    it('hands over the account with its long-lived token and no refresh token', async () => {
      await expect(
        providerWith(() => Promise.resolve(ACCOUNT)).provider.connect(CODE),
      ).resolves.toEqual({
        platform: 'instagram',
        platformUserId: '17841400000000000',
        username: 'rangga.creates',
        accessToken: 'IGAA-long-lived-token',
        accessTokenExpiresAt: EXPIRES_AT,
        // Instagram has none; its long-lived token is refreshed with itself.
        refreshToken: null,
        refreshTokenExpiresAt: null,
      });
    });

    it.each(['BUSINESS', 'MEDIA_CREATOR'])(
      'accepts a Professional %s account',
      async (accountType) => {
        await expect(
          providerWith(() =>
            Promise.resolve({ ...ACCOUNT, accountType }),
          ).provider.connect(CODE),
        ).resolves.toMatchObject({ platform: 'instagram' });
      },
    );

    it('refuses a personal account as not_professional', async () => {
      const refusal = await refusalOf(() =>
        Promise.resolve({ ...ACCOUNT, accountType: 'PERSONAL' }),
      );

      expect(refusal.outcome).toBe('not_professional');
      expect(refusal.message).toBe('account type PERSONAL is not Professional');
    });

    it.each(['not_tester', 'platform_error'] as const)(
      "keeps Instagram's %s",
      async (failure) => {
        const refusal = await refusalOf(() =>
          Promise.reject(new InstagramApiError(failure, 'code exchange: x')),
        );

        expect(refusal.outcome).toBe(failure);
        expect(refusal.message).toBe('code exchange: x');
      },
    );

    // SocialConnectService logs only the kind of anything that is not a PlatformRefusal.
    it('lets any other failure through as it is', async () => {
      const failure = new TypeError('unexpected');

      await expect(
        providerWith(() => Promise.reject(failure)).provider.connect(CODE),
      ).rejects.toBe(failure);
    });

    // Instagram ends the redirect with '#_'; a browser drops it, a pasted address may not.
    it("drops the '#_' Instagram ends its redirect with", async () => {
      const { provider, connect } = providerWith(() =>
        Promise.resolve(ACCOUNT),
      );

      await provider.connect(`${CODE}#_`);

      expect(connect).toHaveBeenCalledWith(CODE);
    });

    it('passes a code without the suffix as it is', async () => {
      const { provider, connect } = providerWith(() =>
        Promise.resolve(ACCOUNT),
      );

      await provider.connect(CODE);

      expect(connect).toHaveBeenCalledWith(CODE);
    });
  });
});
