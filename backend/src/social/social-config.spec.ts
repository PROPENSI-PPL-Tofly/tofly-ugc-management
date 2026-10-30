import { randomBytes } from 'node:crypto';
import { MIN_SECRET_BYTES, OAuthStateSigner } from './oauth-state.js';
import { PrismaSocialAccountLinker } from './prisma-social-account-linker.js';
import type { SocialAccountRows } from './prisma-social-account-linker.js';
import { SocialStoreNotConfigured, socialWiring } from './social-config.js';
import { TikTokProvider } from './tiktok/tiktok-provider.js';

const rows = {} as SocialAccountRows;

const COMPLETE = {
  SOCIAL_STATE_SECRET: 's'.repeat(MIN_SECRET_BYTES),
  SOCIAL_TOKEN_KEY: randomBytes(32).toString('base64'),
  TIKTOK_CLIENT_KEY: 'sbawexamplekey',
  TIKTOK_CLIENT_SECRET: 'example-secret',
  TIKTOK_REDIRECT_URI: 'https://staging.tofly.id/api/social/tiktok/callback',
};

describe('socialWiring', () => {
  it('connects TikTok, signs states and stores accounts when everything is set', () => {
    const wiring = socialWiring(COMPLETE, rows);

    expect(wiring.providers).toHaveLength(1);
    expect(wiring.providers[0]).toBeInstanceOf(TikTokProvider);
    expect(wiring.signer).toBeInstanceOf(OAuthStateSigner);
    expect(wiring.linker).toBeInstanceOf(PrismaSocialAccountLinker);
  });

  it('offers no TikTok while its app is not configured', () => {
    expect(
      socialWiring({ ...COMPLETE, TIKTOK_CLIENT_SECRET: undefined }, rows)
        .providers,
    ).toEqual([]);
  });

  it('signs no state while its secret is not set', () => {
    expect(
      socialWiring({ ...COMPLETE, SOCIAL_STATE_SECRET: '  ' }, rows).signer,
    ).toBeUndefined();
  });

  // OWASP A04:2025: a token must never be stored in the clear, so without the encryption key
  // no platform is offered at all, rather than failing after the creator has consented.
  describe('without the token key', () => {
    const wiring = socialWiring(
      { ...COMPLETE, SOCIAL_TOKEN_KEY: undefined },
      rows,
    );

    it('offers no platform', () => {
      expect(wiring.providers).toEqual([]);
    });

    it('refuses to store any account', async () => {
      await expect(
        wiring.linker.link('creator', {} as never),
      ).rejects.toBeInstanceOf(SocialStoreNotConfigured);
    });
  });

  // A secret that is set but too weak is a mistake to stop at boot, not a feature to switch off.
  it('fails at boot on a state secret that is set but too short', () => {
    expect(() =>
      socialWiring({ ...COMPLETE, SOCIAL_STATE_SECRET: 'short' }, rows),
    ).toThrow('SOCIAL_STATE_SECRET must be at least 32 bytes');
  });

  it('fails at boot on a token key that is set but not 32 bytes', () => {
    expect(() =>
      socialWiring({ ...COMPLETE, SOCIAL_TOKEN_KEY: 'short' }, rows),
    ).toThrow('SOCIAL_TOKEN_KEY must be 32 bytes in base64');
  });

  it('names the missing store when it refuses', () => {
    expect(new SocialStoreNotConfigured().name).toBe(
      'SocialStoreNotConfigured',
    );
  });
});
