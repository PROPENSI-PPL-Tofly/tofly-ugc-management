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
  overrides: Partial<Omit<MyContentRow, 'deadline'>> & { deadline?: string },
): MyContentRow {
  seq += 1;
  return {
    id: overrides.id ?? `content-${String(seq).padStart(2, '0')}`,
    name: overrides.name ?? `Konten ${String(seq).padStart(2, '0')}`,
    type: overrides.type ?? 'evergreen',
    brief: overrides.brief ?? 'Review produk',
    deadline: new Date(`${overrides.deadline ?? '2026-10-30'}T00:00:00.000Z`),
    status: overrides.status ?? 'scheduled',
  };
}

function stub(rows: MyContentRow[], total = rows.length) {
  const client = {
    contents: {
      findMany: vi.fn().mockResolvedValue(rows),
      count: vi.fn().mockResolvedValue(total),
    },
  } satisfies MyContentsClient;
  return { client, service: new MyContentsService(client) };
}

describe('MyContentsService.list', () => {
  beforeEach(() => {
    seq = 0;
  });

  it("reads one page of the creator's own committed contents, nearest deadline first, and only the columns a row shows", async () => {
    const { client, service } = stub([]);

    await service.list(CREATOR_ID, PAGE, NOW);

    expect(client.contents.findMany).toHaveBeenCalledWith({
      where: { is_proposal: false, contracts: { creator_id: CREATOR_ID } },
      select: {
        id: true,
        name: true,
        type: true,
        brief: true,
        deadline: true,
        status: true,
      },
      orderBy: [{ deadline: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      skip: 0,
      take: 5,
    });
    expect(client.contents.count).toHaveBeenCalledWith({
      where: { is_proposal: false, contracts: { creator_id: CREATOR_ID } },
    });
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
      },
    ]);
  });

  it('keeps the order the query returns, submitted links included', async () => {
    const { service } = stub([
      row({ id: 'done', deadline: '2026-10-01', status: 'link_submitted' }),
      row({ id: 'sooner', deadline: '2026-10-20', status: 'draft_review' }),
      row({ id: 'later', deadline: '2026-11-15' }),
    ]);

    const response = await service.list(CREATOR_ID, PAGE, NOW);

    expect(response.items.map((item) => item.id)).toEqual([
      'done',
      'sooner',
      'later',
    ]);
    expect(response.items[0].actions).toEqual([]);
  });

  it('asks the query for the requested page and reports totals across every page', async () => {
    const rows = [row({}), row({})];
    const { client, service } = stub(rows, 7);

    const second = await service.list(
      CREATOR_ID,
      { page: 2, pageSize: 5 },
      NOW,
    );

    expect(client.contents.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 5, take: 5 }),
    );
    expect(second.items.map((item) => item.id)).toEqual(
      rows.map((r) => r.id),
    );
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

  it('answers a page past the end with no rows rather than an error', async () => {
    const { client, service } = stub([], 1);

    const response = await service.list(
      CREATOR_ID,
      { page: 3, pageSize: 5 },
      NOW,
    );

    expect(client.contents.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 5 }),
    );
    expect(response).toMatchObject({
      items: [],
      page: 3,
      total: 1,
      totalPages: 1,
    });
  });
});
