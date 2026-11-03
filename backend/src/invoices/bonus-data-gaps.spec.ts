import {
  BONUS_DATA_GAPS_PENDING_PBI_28_1,
  bonusDataGaps,
  noDataLine,
} from './bonus-data-gaps.js';
import type { FrozenPerformanceLinkDto } from './frozen-links.js';

// The two SCRUM-236 parts that need PBI-28.1's per-link bonus (AC 9 and Rp0 no-data lines). Until
// 28.1 lands, Finalize says so explicitly; it never answers an empty list or a made-up line.

describe('bonusDataGaps (PBI-28.1 integration point)', () => {
  it('reports the gaps as not available yet, naming the missing dependency, with no list at all', () => {
    const gaps = bonusDataGaps();

    expect(gaps).toEqual({ available: false, reason: 'PBI_28_1_PENDING' });
    expect(gaps).not.toHaveProperty('waiting');
    expect(gaps).not.toHaveProperty('noDataLines');
  });

  it('answers one frozen, shared marker that no caller can turn into a list', () => {
    expect(bonusDataGaps()).toBe(BONUS_DATA_GAPS_PENDING_PBI_28_1);
    expect(Object.isFrozen(BONUS_DATA_GAPS_PENDING_PBI_28_1)).toBe(true);
  });
});

describe('noDataLine (for PBI-28.1 to call)', () => {
  const link: FrozenPerformanceLinkDto = {
    contentId: 'content-1',
    contentName: 'Evg_1',
    platform: 'tiktok',
    views: null,
    likes: 830,
    comments: null,
    shares: null,
    source: 'synced',
    state: 'synced',
    lastSyncedAt: '2026-10-30T19:00:00.000Z',
  };

  it('builds the Rp0 line of a link frozen without its configured metric, marked no_data', () => {
    expect(noDataLine(link, 'views')).toEqual({
      contentId: 'content-1',
      contentName: 'Evg_1',
      amount: 0,
      basis: { platform: 'tiktok', metric: 'views', status: 'no_data' },
    });
  });

  // A line says no data only when there is none: a measured 0 or any number is not a gap.
  it.each([
    ['a number', 'likes'],
    ['a measured 0', 'views'],
  ] as const)('refuses a link whose configured metric holds %s', (_, metric) => {
    const measured = { ...link, views: 0 };

    expect(() => noDataLine(measured, metric)).toThrow(
      `link of content-1 has ${metric}; only a missing metric gets a no_data line`,
    );
  });
});
