import { BadRequestException } from '@nestjs/common';
import { checkPerformanceLinksQuery } from './performance-links-query.js';

const RANGGA = '0b5e2c9a-6f3d-4e1b-8a7c-9d2f4e6a8b1c';
const NABILA = '7d0c5f1e-3b1a-4c2e-9f4d-2a6b8c0d1e2f';

/** The 400 message a query is refused with, or null when it was read. */
function refusal(query: Record<string, unknown>): unknown {
  try {
    checkPerformanceLinksQuery(query);
    return null;
  } catch (error) {
    if (!(error instanceof BadRequestException)) throw error;
    return (error.getResponse() as { message: unknown }).message;
  }
}

describe('checkPerformanceLinksQuery (PBI-27 AC 22-23)', () => {
  it('filters on nothing when neither filter is named', () => {
    expect(checkPerformanceLinksQuery({})).toEqual({
      creators: undefined,
      platforms: undefined,
    });
  });

  it('reads one creator or platform, or several repeated, each kept once', () => {
    expect(
      checkPerformanceLinksQuery({ creator: RANGGA, platform: 'tiktok' }),
    ).toEqual({ creators: [RANGGA], platforms: ['tiktok'] });
    expect(
      checkPerformanceLinksQuery({
        creator: [RANGGA, NABILA, RANGGA],
        platform: ['instagram', 'tiktok'],
      }),
    ).toEqual({
      creators: [RANGGA, NABILA],
      platforms: ['instagram', 'tiktok'],
    });
  });

  it.each([
    [
      'a creator that is not an id',
      { creator: 'rangga' },
      'creator must be creator ids',
    ],
    [
      'an id with SQL around it',
      { creator: `${RANGGA}' OR '1'='1` },
      'creator must be creator ids',
    ],
    [
      'a nested creator value',
      { creator: { id: RANGGA } },
      'creator must be creator ids',
    ],
    [
      'a platform the app does not know',
      { platform: 'youtube' },
      'platform must be instagram or tiktok',
    ],
    [
      'a nested platform value',
      { platform: ['tiktok', ['instagram']] },
      'platform must be instagram or tiktok',
    ],
  ])('refuses %s with 400 before anything is read', (_case, query, message) => {
    expect(refusal(query)).toBe(message);
  });
});
