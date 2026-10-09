import {
  MyContentsService,
  type MyContentRow,
  type MyContentsClient,
} from './my-contents.service.js';

const CREATOR_ID = '5b0c8a4e-2f1d-4c3b-9a8e-7d6f5e4c3b2a';
// 09:30 WIB on 10 October, still 9 October in UTC.
const NOW = new Date('2026-10-10T02:30:00.000Z');
const PAGE = { page: 1, pageSize: 5 };

let seq = 0;

function row(
  overrides: Partial<Omit<MyContentRow, 'deadline' | 'submissions'>> & {
    deadline?: string;
    revisionNotes?: string | null;
  },
): MyContentRow {
  seq += 1;
  return {
    id: overrides.id ?? `content-${String(seq).padStart(2, '0')}`,
    name: overrides.name ?? `Konten ${String(seq).padStart(2, '0')}`,
    type: overrides.type ?? 'evergreen',
    brief: overrides.brief ?? 'Review produk',
    deadline: new Date(`${overrides.deadline ?? '2026-10-30'}T00:00:00.000Z`),
    status: overrides.status ?? 'scheduled',
    submissions:
      overrides.revisionNotes === undefined
        ? []
        : [{ revision_notes: overrides.revisionNotes }],
  };
}

type Where = Parameters<MyContentsClient['contents']['count']>[0]['where'];

const isOpen = (where: Where) => where.video_submitted_at === null;

/**
 * A client holding open rows and finished rows apart, as the two segment queries see them.
 * Totals default to the rows given; pass larger ones to stand for rows on other pages.
 */
function stub(
  openRows: MyContentRow[],
  finishedRows: MyContentRow[] = [],
  totals: { open?: number; finished?: number } = {},
) {
  const client = {
    contents: {
      findMany: vi.fn(({ where }: { where: Where }) =>
        Promise.resolve(isOpen(where) ? openRows : finishedRows),
      ),
      count: vi.fn(({ where }: { where: Where }) =>
        Promise.resolve(
          isOpen(where)
            ? (totals.open ?? openRows.length)
            : (totals.finished ?? finishedRows.length),
        ),
      ),
    },
  } satisfies MyContentsClient;
  return { client, service: new MyContentsService(client) };
}

// A pending proposal is not assigned work, so every read names the committed statuses.
const COMMITTED = [
  'scheduled',
  'draft_review',
  'draft_revision',
  'draft_approved',
  'link_submitted',
];
const OWN = {
  status: { in: COMMITTED },
  contracts: { creator_id: CREATOR_ID },
};

describe('MyContentsService.list', () => {
  beforeEach(() => {
    seq = 0;
  });

  it("reads one page of the creator's own committed open contents by nearest deadline, and only the columns a row shows", async () => {
    const { client, service } = stub([row({})], [], { open: 9 });

    await service.list(CREATOR_ID, PAGE, NOW);

    expect(client.contents.findMany).toHaveBeenCalledTimes(1);
    expect(client.contents.findMany).toHaveBeenCalledWith({
      where: { ...OWN, video_submitted_at: null },
      select: {
        id: true,
        name: true,
        type: true,
        brief: true,
        deadline: true,
        status: true,
        submissions: {
          select: { revision_notes: true },
          orderBy: { created_at: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ deadline: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      skip: 0,
      take: 5,
    });
    expect(client.contents.count).toHaveBeenCalledWith({
      where: { ...OWN, video_submitted_at: null },
    });
    expect(client.contents.count).toHaveBeenCalledWith({
      where: { ...OWN, video_submitted_at: { not: null } },
    });
  });

  // UAT: finished tasks came back most-recently-finished first, out of deadline order.
  it('puts finished work after all open work, also by nearest deadline', async () => {
    const { client, service } = stub(
      [row({ id: 'open-a' }), row({ id: 'open-b' })],
      [row({ id: 'done-a', status: 'link_submitted' })],
    );

    const response = await service.list(CREATOR_ID, PAGE, NOW);

    expect(response.items.map((item) => item.id)).toEqual([
      'open-a',
      'open-b',
      'done-a',
    ]);
    expect(client.contents.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ...OWN, video_submitted_at: { not: null } },
        orderBy: [{ deadline: 'asc' }, { name: 'asc' }, { id: 'asc' }],
        skip: 0,
        take: 3,
      }),
    );
    expect(response.total).toBe(3);
  });

  it('cuts a page across the two groups where the open work runs out', async () => {
    const { client, service } = stub([row({})], [row({}), row({})], {
      open: 6,
      finished: 9,
    });

    await service.list(CREATOR_ID, { page: 2, pageSize: 5 }, NOW);

    expect(client.contents.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ...OWN, video_submitted_at: null },
        skip: 5,
        take: 1,
      }),
    );
    expect(client.contents.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ...OWN, video_submitted_at: { not: null } },
        skip: 0,
        take: 4,
      }),
    );
  });

  it('narrows the list and its total to the statuses a filter stands for', async () => {
    const { client, service } = stub([row({})], [], { open: 1 });

    await service.list(CREATOR_ID, { ...PAGE, status: 'draft_review' }, NOW);

    const where = {
      ...OWN,
      status: { in: ['draft_review'] },
      video_submitted_at: null,
    };
    expect(client.contents.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where }),
    );
    expect(client.contents.count).toHaveBeenCalledWith({ where });
  });

  it('maps a row into API vocabulary with its actions for today in WIB', async () => {
    const { service } = stub([
      row({
        id: 'c1',
        name: 'Unboxing',
        type: 'specific',
        brief: 'Tunjukkan kemasan',
        deadline: '2026-10-11',
        status: 'scheduled',
      }),
    ]);

    const response = await service.list(CREATOR_ID, PAGE, NOW);

    // In WIB today is 10 October, so an 11 October deadline is already H-1; in UTC it would not be.
    expect(response.items).toEqual([
      {
        id: 'c1',
        name: 'Unboxing',
        type: 'specific',
        brief: 'Tunjukkan kemasan',
        deadline: '2026-10-11',
        status: 'scheduled',
        actions: ['submit_draft', 'submit_video'],
        revisionNotes: null,
      },
    ]);
  });

  it("carries the admin's latest revision notes on a row waiting for a resubmit", async () => {
    const { service } = stub([
      row({ id: 'c1', status: 'draft_revision', revisionNotes: 'Perjelas intro' }),
    ]);

    const [item] = (await service.list(CREATOR_ID, PAGE, NOW)).items;

    expect(item.revisionNotes).toBe('Perjelas intro');
  });

  it('leaves out revision notes once the revision has been handed in or approved', async () => {
    const { service } = stub([
      row({ id: 'c1', status: 'draft_review', revisionNotes: 'Perjelas intro' }),
      row({ id: 'c2', status: 'draft_approved', revisionNotes: 'Perjelas intro' }),
    ]);

    const { items } = await service.list(CREATOR_ID, PAGE, NOW);

    expect(items.map((item) => item.revisionNotes)).toEqual([null, null]);
  });

  it('answers null revision notes when the revision request left none', async () => {
    const { service } = stub([
      row({ id: 'c1', status: 'draft_revision', revisionNotes: null }),
      row({ id: 'c2', status: 'draft_revision' }),
    ]);

    const { items } = await service.list(CREATOR_ID, PAGE, NOW);

    expect(items.map((item) => item.revisionNotes)).toEqual([null, null]);
  });

  it('keeps the order each query returns, submitted links last and without actions', async () => {
    const { service } = stub(
      [
        row({ id: 'sooner', deadline: '2026-10-20', status: 'draft_review' }),
        row({ id: 'later', deadline: '2026-11-15' }),
      ],
      [row({ id: 'done', deadline: '2026-10-01', status: 'link_submitted' })],
    );

    const response = await service.list(CREATOR_ID, PAGE, NOW);

    expect(response.items.map((item) => item.id)).toEqual([
      'sooner',
      'later',
      'done',
    ]);
    expect(response.items[2].actions).toEqual([]);
  });

  it('asks the query for the requested page and reports totals across every page', async () => {
    const rows = [row({}), row({})];
    const { client, service } = stub(rows, [], { open: 7 });

    const second = await service.list(
      CREATOR_ID,
      { page: 2, pageSize: 5 },
      NOW,
    );

    // Only two of the seven are left for page 2, so only two are asked for.
    expect(client.contents.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 5, take: 2 }),
    );
    expect(second.items.map((item) => item.id)).toEqual(rows.map((r) => r.id));
    expect(second).toMatchObject({
      page: 2,
      pageSize: 5,
      total: 7,
      totalPages: 2,
    });
  });

  it('answers an empty list with one empty page', async () => {
    const { service } = stub([]);

    expect(await service.list(CREATOR_ID, PAGE, NOW)).toEqual({
      items: [],
      page: 1,
      pageSize: 5,
      total: 0,
      totalPages: 1,
    });
  });

  it('answers a page past the end with no rows rather than an error, without reading any', async () => {
    const { client, service } = stub([], [], { open: 1 });

    const response = await service.list(
      CREATOR_ID,
      { page: 3, pageSize: 5 },
      NOW,
    );

    expect(client.contents.findMany).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      items: [],
      page: 3,
      total: 1,
      totalPages: 1,
    });
  });
});
