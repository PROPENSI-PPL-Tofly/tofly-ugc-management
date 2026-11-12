import { BadRequestException } from '@nestjs/common';
import {
  checkPerformanceLinksQuery,
  LINK_PERFORMANCE_SELECT,
  linkPerformanceOf,
  toPerformanceLinkItem,
  type PerformanceLinkRow,
} from './performance-links.js';

const CREATOR_A = '0f9c2f5e-6b1a-4f3e-9a51-3c1d2e4b5a60';
const CREATOR_B = '11111111-1111-4111-8111-111111111111';
const CONTENT_ID = '7d0c5f1e-3b1a-4c2e-9f4d-2a6b8c0d1e2f';
const LINK_ID = '3c2b1a09-8f7e-4d6c-9b5a-4e3d2c1b0a9f';

function row(overrides: Partial<PerformanceLinkRow> = {}): PerformanceLinkRow {
  return {
    id: LINK_ID,
    platform: 'instagram',
    url: 'https://www.instagram.com/reel/C9xYz/',
    views: 12400,
    likes: null,
    comments: 0,
    shares: null,
    data_state: 'synced',
    last_synced_at: new Date('2026-11-01T19:00:00.000Z'),
    manual_at: null,
    manual_users: null,
    contents: {
      id: CONTENT_ID,
      name: 'Review Kopi',
      contracts: {
        creators: {
          id: CREATOR_A,
          first_name: 'Rani',
          middle_name: null,
          last_name: 'Putri',
          social_accounts: [
            {
              platform: 'instagram',
              is_connected: true,
              platform_user_id: '1784',
            },
          ],
        },
      },
    },
    ...overrides,
  };
}

describe('checkPerformanceLinksQuery', () => {
  it('lists every link when nothing narrows it', () => {
    expect(checkPerformanceLinksQuery({})).toEqual({});
  });

  it('narrows by one or more creators and platforms, each kept once', () => {
    expect(
      checkPerformanceLinksQuery({
        creator: [CREATOR_A, CREATOR_B, CREATOR_A],
        platform: 'tiktok',
      }),
    ).toEqual({ creators: [CREATOR_A, CREATOR_B], platforms: ['tiktok'] });
  });

  it.each([
    [
      'a creator that is not an id',
      { creator: 'rani' },
      'creator must be a creator id',
    ],
    [
      'an unknown platform',
      { platform: 'youtube' },
      'platform must be instagram or tiktok',
    ],
    [
      'a platform given as an object',
      { platform: { a: 1 } },
      'platform must be instagram or tiktok',
    ],
    [
      'more creators than any filter needs',
      { creator: Array.from({ length: 51 }, () => CREATOR_A) },
      'creator takes at most 50 values',
    ],
    [
      'more platforms than any filter needs',
      { platform: Array.from({ length: 51 }, () => 'tiktok') },
      'platform takes at most 50 values',
    ],
  ])('answers 400 for %s', (_label, query, message) => {
    expect(() => checkPerformanceLinksQuery(query)).toThrow(
      new BadRequestException(message),
    );
  });
});

describe('linkPerformanceOf', () => {
  it('gives the four numbers, a null kept as no data and a 0 as 0 (AC 1, 2)', () => {
    expect(linkPerformanceOf(row())).toEqual({
      platform: 'instagram',
      url: 'https://www.instagram.com/reel/C9xYz/',
      views: 12400,
      likes: null,
      comments: 0,
      shares: null,
      state: 'synced',
      lastSyncedAt: '2026-11-01T19:00:00.000Z',
      manualAt: null,
      manualBy: null,
    });
  });

  it('reads a waiting link as Akun belum terhubung while that platform is not connected', () => {
    expect(
      linkPerformanceOf(
        row({
          data_state: 'waiting',
          last_synced_at: null,
          contents: {
            ...row().contents,
            contracts: {
              creators: {
                ...row().contents.contracts.creators,
                social_accounts: [],
              },
            },
          },
        }),
      ).state,
    ).toBe('not_connected');
  });

  it('gives the time an admin filled the numbers in, and that admin by email', () => {
    expect(
      linkPerformanceOf(
        row({
          data_state: 'manual',
          manual_at: new Date('2026-11-02T03:00:00.000Z'),
          manual_users: { email: 'sinta.admin@tofly.id' },
        }),
      ),
    ).toMatchObject({
      state: 'manual',
      manualAt: '2026-11-02T03:00:00.000Z',
      manualBy: 'sinta.admin@tofly.id',
    });
  });

  it('reads the columns that name the admin who typed the numbers', () => {
    expect(LINK_PERFORMANCE_SELECT.manual_users).toEqual({
      select: { email: true },
    });
  });
});

describe('toPerformanceLinkItem', () => {
  it('names the creator and the content beside the link, so a row opens its Content Detail', () => {
    expect(toPerformanceLinkItem(row())).toEqual({
      linkId: LINK_ID,
      contentId: CONTENT_ID,
      contentName: 'Review Kopi',
      creatorId: CREATOR_A,
      creatorName: 'Rani Putri',
      ...linkPerformanceOf(row()),
    });
  });
});
