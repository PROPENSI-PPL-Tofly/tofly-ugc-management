import type { SyncGroup } from './sync-selection.js';
import { outcomesFor, summarize, type LinkOutcome } from './sync-outcome.js';

const NOW = new Date('2026-11-03T19:00:00.000Z');
const CREATOR = '0f9c2f5e-6b1a-4f3e-9a51-3c1d2e4b5a60';
const METRICS = { views: 12400, likes: 830, comments: null, shares: 0 };

function group(
  ...links: {
    id: string;
    storedState?: SyncGroup['links'][number]['storedState'];
  }[]
): SyncGroup {
  return {
    creatorId: CREATOR,
    platform: 'tiktok',
    links: links.map(({ id, storedState = 'waiting' }) => ({
      id,
      url: `https://www.tiktok.com/@a/video/${id}`,
      contentId: `content-${id}`,
      platform: 'tiktok',
      storedState,
    })),
  };
}

describe('outcomesFor', () => {
  it("saves a synced link's four numbers, empty ones staying empty, with the sync time (AC 1-3)", () => {
    const [outcome] = outcomesFor(
      group({ id: 'l1' }),
      {
        outcome: 'read',
        readings: [{ linkId: 'l1', outcome: 'synced', metrics: METRICS }],
      },
      NOW,
    );

    expect(outcome).toEqual({
      linkId: 'l1',
      contentId: 'content-l1',
      platform: 'tiktok',
      storedState: 'waiting',
      synced: true,
      write: {
        ...METRICS,
        data_state: 'synced',
        last_synced_at: NOW,
        manual_by: null,
        manual_at: null,
      },
    });
  });

  it("lets the platform's numbers replace ones an admin typed in, dropping the manual stamp (AC 17)", () => {
    const [outcome] = outcomesFor(
      group({ id: 'l1', storedState: 'manual' }),
      {
        outcome: 'read',
        readings: [{ linkId: 'l1', outcome: 'synced', metrics: METRICS }],
      },
      NOW,
    );

    expect(outcome.write).toMatchObject({
      data_state: 'synced',
      manual_by: null,
      manual_at: null,
    });
  });

  it('marks a deleted, private or foreign video not found and keeps its last numbers (AC 8, 11)', () => {
    const [outcome] = outcomesFor(
      group({ id: 'l1', storedState: 'synced' }),
      { outcome: 'read', readings: [{ linkId: 'l1', outcome: 'not_found' }] },
      NOW,
    );

    expect(outcome).toMatchObject({
      synced: false,
      write: { data_state: 'not_found' },
    });
    expect(Object.keys(outcome.write ?? {})).toEqual(['data_state']);
  });

  it('marks a failed link "Gagal sinkron" and keeps its last numbers, to be retried next run (AC 3, 6)', () => {
    const [outcome] = outcomesFor(
      group({ id: 'l1', storedState: 'synced' }),
      {
        outcome: 'read',
        readings: [
          { linkId: 'l1', outcome: 'failed', reason: 'insights: 500' },
        ],
      },
      NOW,
    );

    expect(outcome).toMatchObject({
      synced: false,
      write: { data_state: 'sync_failed' },
    });
    expect(Object.keys(outcome.write ?? {})).toEqual(['data_state']);
  });

  it('marks every link "Akun belum terhubung" when the account is gone or its refresh failed (AC 7)', () => {
    const outcomes = outcomesFor(
      group({ id: 'l1' }, { id: 'l2', storedState: 'synced' }),
      { outcome: 'disconnected' },
      NOW,
    );

    expect(outcomes.map((o) => [o.linkId, o.synced, o.write])).toEqual([
      ['l1', false, { data_state: 'not_connected' }],
      ['l2', false, { data_state: 'not_connected' }],
    ]);
  });

  it('marks the whole group "Gagal sinkron" when the source threw or ran out of time (AC 6)', () => {
    const outcomes = outcomesFor(
      group({ id: 'l1' }, { id: 'l2' }),
      { outcome: 'error' },
      NOW,
    );

    expect(outcomes.map((o) => o.write)).toEqual([
      { data_state: 'sync_failed' },
      { data_state: 'sync_failed' },
    ]);
  });

  it('treats a link the source gave no reading for as failed, so it is retried', () => {
    const [outcome] = outcomesFor(
      group({ id: 'l1' }),
      { outcome: 'read', readings: [] },
      NOW,
    );

    expect(outcome).toMatchObject({
      synced: false,
      write: { data_state: 'sync_failed' },
    });
  });

  it.each([
    [
      'not found',
      { outcome: 'read', readings: [{ linkId: 'l1', outcome: 'not_found' }] },
    ],
    [
      'failed',
      {
        outcome: 'read',
        readings: [{ linkId: 'l1', outcome: 'failed', reason: 'x' }],
      },
    ],
    ['disconnected', { outcome: 'disconnected' }],
    ['an error', { outcome: 'error' }],
  ] as const)(
    'keeps a link an admin filled in "Diisi manual" when the platform answers %s: only real numbers replace it (AC 14, 17)',
    (_, result) => {
      const [outcome] = outcomesFor(
        group({ id: 'l1', storedState: 'manual' }),
        result,
        NOW,
      );

      expect(outcome).toMatchObject({ synced: false, write: null });
    },
  );

  it('writes nothing when no source reads this platform here, so the links stay as they were', () => {
    const [outcome] = outcomesFor(
      group({ id: 'l1', storedState: 'synced' }),
      { outcome: 'unavailable' },
      NOW,
    );

    expect(outcome).toMatchObject({ synced: false, write: null });
  });
});

describe('summarize', () => {
  function outcome(linkId: string, synced: boolean): LinkOutcome {
    return {
      linkId,
      contentId: `content-${linkId}`,
      platform: linkId.startsWith('ig') ? 'instagram' : 'tiktok',
      storedState: 'waiting',
      synced,
      write: null,
    };
  }

  it('counts links processed, succeeded and failed, and names each one not brought up to date', () => {
    expect(
      summarize([
        outcome('tt1', true),
        outcome('ig1', false),
        outcome('tt2', false),
      ]),
    ).toEqual({
      processed: 3,
      succeeded: 1,
      failed: 2,
      notUpdated: [
        { contentId: 'content-ig1', platform: 'instagram' },
        { contentId: 'content-tt2', platform: 'tiktok' },
      ],
    });
  });

  it('reports an empty run as nothing processed', () => {
    expect(summarize([])).toEqual({
      processed: 0,
      succeeded: 0,
      failed: 0,
      notUpdated: [],
    });
  });
});
