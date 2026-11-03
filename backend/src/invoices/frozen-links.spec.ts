import {
  lockDeliveredLinks,
  toFrozenLink,
  type FrozenLinkRow,
} from './frozen-links.js';

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

describe('lockDeliveredLinks', () => {
  // OWASP A08:2025 Software or Data Integrity Failures: the links are read and share-locked in one
  // statement, so no sync can change a number between this read and the invoice's commit.
  it("reads and share-locks the contract's delivered links in one statement, first handed in first", async () => {
    const rows = [row()];
    const tx = { $queryRaw: vi.fn().mockResolvedValue(rows) };

    await expect(lockDeliveredLinks(tx, 'contract-1')).resolves.toBe(rows);

    const [query] = tx.$queryRaw.mock.calls[0];
    expect(query.text.replace(/\s+/g, ' ').trim()).toBe(
      "SELECT l.content_id, c.name AS content_name, l.platform, l.views, l.likes, l.comments, l.shares, l.data_state, l.last_synced_at, l.manual_at FROM content_links l JOIN contents c ON c.id = l.content_id WHERE c.contract_id = $1::uuid AND c.status = 'link_submitted' AND l.platform IS NOT NULL ORDER BY c.deadline, c.id, l.submitted_at, l.created_at, l.id FOR SHARE OF l",
    );
  });

  // OWASP A05:2025 Injection: the contract id is bound, never spliced into the SQL.
  it('binds the contract id as a parameter', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const id = "contract-1'; DROP TABLE content_links; --";

    await lockDeliveredLinks(tx, id);

    expect(tx.$queryRaw.mock.calls[0][0].values).toEqual([id]);
  });
});
