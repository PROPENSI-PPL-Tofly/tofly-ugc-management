import { randomBytes } from 'node:crypto';
import type { PrismaService } from '../prisma/prisma.service.js';
import { performanceSources } from './performance-wiring.js';
import { TikTokPerformanceSource } from './tiktok/tiktok-performance-source.js';

const rows = { social_accounts: {} } as unknown as PrismaService;

const TIKTOK = {
  TIKTOK_CLIENT_KEY: 'sbawexamplekey',
  TIKTOK_CLIENT_SECRET: 'tiktok-secret',
  TIKTOK_REDIRECT_URI: 'https://staging.tofly.id/api/social/tiktok/callback',
};

function env(overrides: Record<string, string | undefined> = {}) {
  return {
    ...TIKTOK,
    SOCIAL_TOKEN_KEY: randomBytes(32).toString('base64'),
    ...overrides,
  };
}

describe('performanceSources', () => {
  it('offers the TikTok source once the token key and the TikTok app are configured', () => {
    const sources = performanceSources(env(), rows);

    expect(sources).toHaveLength(1);
    expect(sources[0]).toBeInstanceOf(TikTokPerformanceSource);
    expect(sources[0].platform).toBe('tiktok');
  });

  // Without the key no stored token opens, so no platform can be read (as 19.2's wiring).
  it.each([
    ['the token key is not set', { SOCIAL_TOKEN_KEY: undefined }],
    ['the token key is blank', { SOCIAL_TOKEN_KEY: '   ' }],
    ['the TikTok app is not set', { TIKTOK_CLIENT_SECRET: undefined }],
    [
      'the TikTok redirect is not https',
      { TIKTOK_REDIRECT_URI: 'http://localhost/cb' },
    ],
  ])('offers no TikTok source when %s', (_, overrides) => {
    expect(performanceSources(env(overrides), rows)).toEqual([]);
  });

  // A key set wrongly is a mistake, not a choice: the boot fails rather than syncing nothing.
  it('fails at boot on a token key that is not 32 bytes', () => {
    expect(() =>
      performanceSources(env({ SOCIAL_TOKEN_KEY: 'too-short' }), rows),
    ).toThrow('SOCIAL_TOKEN_KEY must be 32 bytes in base64');
  });
});
