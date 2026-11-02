import {
  FINALIZE_SYNC_TIMEOUT_MS,
  lastSyncBeforeFinalize,
  notUpdatedLinks,
  snapshotLinks,
  waitingLinks,
} from './finalize-performance.js';
import { content, day, FORMULA, link } from './invoice-test-data.js';

const SYNCED_AT = new Date('2026-09-17T19:00:00.000Z');

function delivered(
  id: string,
  links: ReturnType<typeof link>[],
  overrides: Parameters<typeof content>[0] = {},
) {
  return content({
    id,
    name: `Konten ${id}`,
    status: 'link_submitted',
    deadline: day(0),
    videoSubmittedAt: day(-1),
    links,
    ...overrides,
  });
}

describe('waitingLinks (PBI-28 AC 9)', () => {
  it('lists each link that could earn a bonus but has no number on its metric, with its state', () => {
    expect(
      waitingLinks(
        [
          delivered('a', [
            link('instagram', { views: 41_200, state: 'synced' }),
            link('tiktok', { state: 'not_found' }),
          ]),
          delivered('b', [link('instagram', { state: 'not_connected' })]),
        ],
        FORMULA,
      ),
    ).toEqual([
      {
        contentId: 'a',
        contentName: 'Konten a',
        platform: 'tiktok',
        metric: 'likes',
        state: 'not_found',
      },
      {
        contentId: 'b',
        contentName: 'Konten b',
        platform: 'instagram',
        metric: 'views',
        state: 'not_connected',
      },
    ]);
  });

  it('leaves out what could never earn: not delivered, late Specific, a platform without tiers', () => {
    expect(
      waitingLinks(
        [
          delivered('draft', [link('instagram')], { status: 'draft_approved' }),
          delivered('late', [link('instagram')], {
            type: 'specific',
            deadline: day(-3),
          }),
          delivered('untiered', [link('tiktok')]),
        ],
        {
          ...FORMULA,
          performanceBonus: { instagram: FORMULA.performanceBonus.instagram },
        },
      ),
    ).toEqual([]);
  });

  it('lists nothing while no formula is saved', () => {
    expect(waitingLinks([delivered('a', [link('instagram')])], null)).toEqual(
      [],
    );
  });
});

describe('snapshotLinks (PBI-28 AC 10)', () => {
  it("keeps every delivered link's numbers, source and sync time", () => {
    expect(
      snapshotLinks([
        delivered('a', [
          link('instagram', {
            views: 41_200,
            likes: 0,
            state: 'synced',
            lastSyncedAt: SYNCED_AT,
          }),
          link('tiktok', { likes: 900, state: 'manual' }),
        ]),
        delivered('draft', [link('instagram')], { status: 'draft_approved' }),
      ]),
    ).toEqual([
      {
        contentId: 'a',
        contentName: 'Konten a',
        platform: 'instagram',
        views: 41_200,
        likes: 0,
        comments: null,
        shares: null,
        source: 'synced',
        state: 'synced',
        lastSyncedAt: '2026-09-17T19:00:00.000Z',
      },
      {
        contentId: 'a',
        contentName: 'Konten a',
        platform: 'tiktok',
        views: null,
        likes: 900,
        comments: null,
        shares: null,
        source: 'manual',
        state: 'manual',
        lastSyncedAt: null,
      },
    ]);
  });
});

describe('notUpdatedLinks (PBI-28 AC 8)', () => {
  const contents = [
    delivered('a', [
      link('instagram', { state: 'synced' }),
      link('tiktok', { state: 'sync_failed' }),
    ]),
  ];

  it('names the links the sync could not update, with their state', () => {
    expect(
      notUpdatedLinks(contents, {
        status: 'done',
        notUpdated: [{ contentId: 'a', platform: 'tiktok' }],
      }),
    ).toEqual([
      {
        contentId: 'a',
        contentName: 'Konten a',
        platform: 'tiktok',
        state: 'sync_failed',
      },
    ]);
  });

  it.each(['failed', 'timed_out'] as const)(
    'names every delivered link when the whole sync %s',
    (status) => {
      expect(
        notUpdatedLinks(contents, { status, notUpdated: [] }).map(
          (item) => item.platform,
        ),
      ).toEqual(['instagram', 'tiktok']);
    },
  );

  it('names none while no sync exists yet: the numbers were never going to be fetched', () => {
    expect(
      notUpdatedLinks(contents, { status: 'unavailable', notUpdated: [] }),
    ).toEqual([]);
  });

  it('skips a link the sync named that the contract does not hold', () => {
    expect(
      notUpdatedLinks(contents, {
        status: 'done',
        notUpdated: [{ contentId: 'other', platform: 'tiktok' }],
      }),
    ).toEqual([]);
  });
});

describe('lastSyncBeforeFinalize (PBI-28 AC 7, 8)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('gives the links the sync could not update when it finished', async () => {
    const sync = {
      syncContract: vi.fn().mockResolvedValue({
        notUpdated: [{ contentId: 'a', platform: 'tiktok' }],
      }),
    };

    expect(await lastSyncBeforeFinalize(sync, 'contract-1')).toEqual({
      status: 'done',
      notUpdated: [{ contentId: 'a', platform: 'tiktok' }],
    });
    expect(sync.syncContract).toHaveBeenCalledWith('contract-1');
  });

  it('says unavailable while no sync is wired in yet', async () => {
    expect(
      await lastSyncBeforeFinalize(
        { syncContract: () => Promise.resolve(null) },
        'contract-1',
      ),
    ).toEqual({ status: 'unavailable', notUpdated: [] });
  });

  it('carries on with the stored numbers when the sync fails', async () => {
    expect(
      await lastSyncBeforeFinalize(
        { syncContract: () => Promise.reject(new Error('instagram down')) },
        'contract-1',
      ),
    ).toEqual({ status: 'failed', notUpdated: [] });
  });

  it('stops waiting after 20 seconds and carries on with the stored numbers', async () => {
    vi.useFakeTimers();
    const pending = lastSyncBeforeFinalize(
      { syncContract: () => new Promise(() => undefined) },
      'contract-1',
    );

    await vi.advanceTimersByTimeAsync(FINALIZE_SYNC_TIMEOUT_MS);

    expect(await pending).toEqual({ status: 'timed_out', notUpdated: [] });
    expect(FINALIZE_SYNC_TIMEOUT_MS).toBe(20_000);
  });

  it('still takes a sync that finishes just inside the 20 seconds', async () => {
    vi.useFakeTimers();
    const pending = lastSyncBeforeFinalize(
      {
        syncContract: () =>
          new Promise((resolve) =>
            setTimeout(
              () => resolve({ notUpdated: [] }),
              FINALIZE_SYNC_TIMEOUT_MS - 1,
            ),
          ),
      },
      'contract-1',
    );

    await vi.advanceTimersByTimeAsync(FINALIZE_SYNC_TIMEOUT_MS);

    expect(await pending).toEqual({ status: 'done', notUpdated: [] });
  });
});
