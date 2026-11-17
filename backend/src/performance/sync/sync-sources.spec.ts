import { randomBytes } from 'node:crypto';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { InstagramPerformanceSource } from '../instagram/instagram-performance-source.js';
import { performanceSources } from '../performance-wiring.js';
import type { PerformanceSource } from '../ports.js';
import { TikTokPerformanceSource } from '../tiktok/tiktok-performance-source.js';
import { syncSources } from './sync-sources.js';

vi.mock('../performance-wiring.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../performance-wiring.js')>();
  return { performanceSources: vi.fn(actual.performanceSources) };
});

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

const platforms = (sources: PerformanceSource[]) =>
  sources.map((source) => source.platform);

describe('syncSources', () => {
  it("reads TikTok through #142's wiring and Instagram through its merged adapter (AC 4)", () => {
    const sources = syncSources(env(), rows);

    expect(platforms(sources)).toEqual(['tiktok', 'instagram']);
    expect(sources[0]).toBeInstanceOf(TikTokPerformanceSource);
    expect(sources[1]).toBeInstanceOf(InstagramPerformanceSource);
  });

  it('still reads Instagram when the TikTok app is not configured: it needs no app secret', () => {
    expect(
      platforms(syncSources(env({ TIKTOK_CLIENT_SECRET: undefined }), rows)),
    ).toEqual(['instagram']);
  });

  it.each([
    ['not set', undefined],
    ['blank', '  '],
  ])(
    'reads no platform when the token key is %s, since no stored token would open',
    (_, key) => {
      expect(syncSources(env({ SOCIAL_TOKEN_KEY: key }), rows)).toEqual([]);
    },
  );

  it('adds no second Instagram source once the shared wiring offers one', () => {
    const offered = { platform: 'instagram', read: vi.fn() } as const;
    vi.mocked(performanceSources).mockReturnValueOnce([offered]);

    expect(syncSources(env(), rows)).toEqual([offered]);
  });
});
