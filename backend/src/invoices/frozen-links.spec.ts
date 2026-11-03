import { toFrozenLink, type FrozenLinkRow } from './frozen-links.js';

// What a finalized invoice keeps of each delivered link (PBI-28 28.2, AC 10): its four numbers as
// they stood, where they came from, its state and when a sync last brought them.

const SYNCED_AT = new Date('2026-10-30T19:00:00.000Z');
const TYPED_AT = new Date('2026-10-31T03:30:00.000Z');

function row(overrides: Partial<FrozenLinkRow> = {}): FrozenLinkRow {
  return {
    content_id: 'content-1',
    content_name: 'Evg_1',
    platform: 'tiktok',
    views: 12_400,
    likes: 830,
    comments: 0,
    shares: null,
    data_state: 'synced',
    last_synced_at: SYNCED_AT,
    manual_at: null,
    ...overrides,
  };
}

describe('toFrozenLink', () => {
  it('keeps a synced link as it stood: numbers, 0 apart from empty, state and sync time', () => {
    expect(toFrozenLink(row())).toEqual({
      contentId: 'content-1',
      contentName: 'Evg_1',
      platform: 'tiktok',
      views: 12_400,
      likes: 830,
      comments: 0,
      shares: null,
      source: 'synced',
      state: 'synced',
      lastSyncedAt: '2026-10-30T19:00:00.000Z',
    });
  });

  it('marks numbers an admin typed in as manual', () => {
    expect(
      toFrozenLink(
        row({ data_state: 'manual', last_synced_at: null, manual_at: TYPED_AT }),
      ),
    ).toMatchObject({ source: 'manual', state: 'manual', lastSyncedAt: null });
  });

  // A link the platform could not read keeps its last numbers: they still came from somewhere.
  it.each([
    ['a sync', { manual_at: null }, 'synced'],
    ['an admin', { last_synced_at: null, manual_at: TYPED_AT }, 'manual'],
  ] as const)(
    'names %s as the source of the numbers a not_found or sync_failed link kept',
    (_, stamps, source) => {
      for (const data_state of ['not_found', 'sync_failed'] as const) {
        expect(toFrozenLink(row({ data_state, ...stamps })).source).toBe(source);
      }
    },
  );

  it('names whichever came last when both a sync and an admin stamped the link', () => {
    const later = new Date(SYNCED_AT.getTime() + 1);
    const earlier = new Date(SYNCED_AT.getTime() - 1);

    expect(
      toFrozenLink(row({ data_state: 'sync_failed', manual_at: later })).source,
    ).toBe('manual');
    expect(
      toFrozenLink(row({ data_state: 'sync_failed', manual_at: SYNCED_AT }))
        .source,
    ).toBe('manual');
    expect(
      toFrozenLink(row({ data_state: 'sync_failed', manual_at: earlier }))
        .source,
    ).toBe('synced');
  });

  it('gives no source to a link that never had numbers', () => {
    expect(
      toFrozenLink(
        row({
          data_state: 'waiting',
          views: null,
          likes: null,
          comments: null,
          shares: null,
          last_synced_at: null,
        }),
      ),
    ).toMatchObject({
      views: null,
      likes: null,
      comments: null,
      shares: null,
      source: null,
      state: 'waiting',
      lastSyncedAt: null,
    });
  });
});
