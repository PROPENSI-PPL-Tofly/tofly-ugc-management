import {
  canSync,
  groupLinks,
  syncableLinks,
  type SyncLinkRow,
} from './sync-selection.js';

const CREATOR_A = '0f9c2f5e-6b1a-4f3e-9a51-3c1d2e4b5a60';
const CREATOR_B = '6a1d0c9e-2b3f-4a5d-8e7f-9c0b1a2d3e4f';

function row(overrides: Partial<SyncLinkRow> & { creator?: string } = {}) {
  const { creator = CREATOR_A, ...rest } = overrides;
  return {
    id: 'link-1',
    url: 'https://www.tiktok.com/@a/video/1',
    platform: 'tiktok',
    data_state: 'waiting',
    content_id: 'content-1',
    contents: { contracts: { creator_id: creator } },
    ...rest,
  } satisfies SyncLinkRow;
}

describe('syncableLinks', () => {
  // AC 4, 5: only "Link Dikirim" content whose invoice still runs (or has no invoice row yet,
  // which the invoice pipeline reads as running), and only links with a platform to ask.
  const ELIGIBLE = {
    status: 'link_submitted',
    contracts: {
      OR: [
        { invoice: { is: null } },
        { invoice: { is: { status: 'running' } } },
      ],
    },
  };

  it('picks every link of delivered content whose invoice is still running (AC 4, 5)', () => {
    expect(syncableLinks({ kind: 'all' })).toEqual({
      platform: { not: null },
      contents: ELIGIBLE,
    });
  });

  it('narrows to one content for "Sinkronkan Sekarang" (AC 12)', () => {
    expect(syncableLinks({ kind: 'content', contentId: 'content-9' })).toEqual({
      platform: { not: null },
      contents: { ...ELIGIBLE, id: 'content-9' },
    });
  });

  it('narrows to one contract for the last sync before Finalize', () => {
    expect(
      syncableLinks({ kind: 'contract', contractId: 'contract-9' }),
    ).toEqual({
      platform: { not: null },
      contents: {
        ...ELIGIBLE,
        contracts: { ...ELIGIBLE.contracts, id: 'contract-9' },
      },
    });
  });
});

describe('canSync', () => {
  it('lets delivered content with a running invoice or none yet be synced', () => {
    expect(
      canSync({
        status: 'link_submitted',
        contracts: { invoice: { status: 'running' } },
      }),
    ).toBe(true);
    expect(
      canSync({ status: 'link_submitted', contracts: { invoice: null } }),
    ).toBe(true);
  });

  it.each(['finalized', 'creator_acked', 'payment_uploaded', 'paid'] as const)(
    'refuses content whose invoice is %s: its numbers are frozen (AC 5)',
    (status) => {
      expect(
        canSync({
          status: 'link_submitted',
          contracts: { invoice: { status } },
        }),
      ).toBe(false);
    },
  );

  it.each(['scheduled', 'draft_review', 'draft_approved'] as const)(
    'refuses content still %s: it has no link to read yet (AC 4)',
    (status) => {
      expect(canSync({ status, contracts: { invoice: null } })).toBe(false);
    },
  );
});

describe('groupLinks', () => {
  it('reads each creator once per platform, so a platform lists its media or batches ids once', () => {
    const groups = groupLinks([
      row({ id: 'a-tt-1', content_id: 'c1' }),
      row({
        id: 'a-ig-1',
        platform: 'instagram',
        url: 'https://www.instagram.com/reel/A1/',
        content_id: 'c1',
      }),
      row({ id: 'a-tt-2', content_id: 'c2', data_state: 'manual' }),
      row({ id: 'b-tt-1', content_id: 'c3', creator: CREATOR_B }),
    ]);

    expect(groups).toEqual([
      {
        creatorId: CREATOR_A,
        platform: 'tiktok',
        links: [
          {
            id: 'a-tt-1',
            url: 'https://www.tiktok.com/@a/video/1',
            contentId: 'c1',
            platform: 'tiktok',
            storedState: 'waiting',
          },
          {
            id: 'a-tt-2',
            url: 'https://www.tiktok.com/@a/video/1',
            contentId: 'c2',
            platform: 'tiktok',
            storedState: 'manual',
          },
        ],
      },
      {
        creatorId: CREATOR_A,
        platform: 'instagram',
        links: [
          {
            id: 'a-ig-1',
            url: 'https://www.instagram.com/reel/A1/',
            contentId: 'c1',
            platform: 'instagram',
            storedState: 'waiting',
          },
        ],
      },
      {
        creatorId: CREATOR_B,
        platform: 'tiktok',
        links: [
          {
            id: 'b-tt-1',
            url: 'https://www.tiktok.com/@a/video/1',
            contentId: 'c3',
            platform: 'tiktok',
            storedState: 'waiting',
          },
        ],
      },
    ]);
  });

  it('leaves out a link with no platform, which no source can read', () => {
    expect(groupLinks([row({ platform: null })])).toEqual([]);
  });

  it('has nothing to read when there are no links', () => {
    expect(groupLinks([])).toEqual([]);
  });
});
