import type { MyTaskFilters } from './my-task-query.js';
import {
  MyContentsService,
  type MyContentRow,
  type MyContentsClient,
} from './my-contents.service.js';

const CREATOR_ID = '5b0c8a4e-2f1d-4c3b-9a8e-7d6f5e4c3b2a';
// 09:30 WIB on 10 October, still 9 October in UTC.
const NOW = new Date('2026-10-10T02:30:00.000Z');
const PAGE = { page: 1, pageSize: 10 };
const ALL: MyTaskFilters = { tab: 'all', sort: 'deadline_asc' };

/** One page of Semua, nearest deadline first, with whatever the test narrows by. */
const query = (filters: Partial<MyTaskFilters> = {}, paging = PAGE) => ({
  ...paging,
  ...ALL,
  ...filters,
});

let seq = 0;

function row(
  overrides: Partial<
    Omit<MyContentRow, 'deadline' | 'submissions' | 'video_submitted_at'>
  > & {
    deadline?: string;
    revisionNotes?: string | null;
    /** When the latest draft was handed in, if any. */
    draftAt?: string;
    /** The day the link went in, if it did. */
    linkDay?: string;
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
    video_submitted_at: overrides.linkDay
      ? new Date(`${overrides.linkDay}T00:00:00.000Z`)
      : null,
    approval_bypassed: overrides.approval_bypassed ?? false,
    content_links: overrides.content_links ?? [],
    submissions:
      overrides.revisionNotes === undefined && overrides.draftAt === undefined
        ? []
        : [
            {
              revision_notes: overrides.revisionNotes ?? null,
              created_at: new Date(
                overrides.draftAt ?? '2026-10-01T03:00:00.000Z',
              ),
            },
          ],
  };
}

type Where = Parameters<MyContentsClient['contents']['findMany']>[0]['where'];

/** A client holding the creator's rows, as the one read sees them. */
function stub(rows: MyContentRow[]) {
  const client = {
    contents: {
      findMany: vi.fn((_args: { where: Where }) => Promise.resolve(rows)),
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

const ids = (response: { items: { id: string }[] }) =>
  response.items.map((item) => item.id);

describe('MyContentsService.list', () => {
  beforeEach(() => {
    seq = 0;
  });

  it("reads only the creator's own committed contents, and only the columns a row shows", async () => {
    const { client, service } = stub([row({})]);

    await service.list(CREATOR_ID, query(), NOW);

    expect(client.contents.findMany).toHaveBeenCalledTimes(1);
    expect(client.contents.findMany).toHaveBeenCalledWith({
      where: OWN,
      select: {
        id: true,
        name: true,
        type: true,
        brief: true,
        deadline: true,
        status: true,
        video_submitted_at: true,
        approval_bypassed: true,
        // Only which platforms have a link, for the row's icons (PBI-38 AC 13), never the links.
        content_links: { select: { platform: true } },
        submissions: {
          select: { revision_notes: true, created_at: true },
          orderBy: { created_at: 'desc' },
          take: 1,
        },
      },
    });
  });

  it('names the platforms a content has a link for, Instagram first, for the row\'s icons (PBI-38 AC 13)', async () => {
    const { service } = stub([
      row({
        status: 'link_submitted',
        linkDay: '2026-10-01',
        content_links: [{ platform: 'tiktok' }, { platform: 'instagram' }],
      }),
      row({ status: 'link_submitted', linkDay: '2026-10-01', content_links: [{ platform: null }] }),
      row({}),
    ]);

    const response = await service.list(CREATOR_ID, query(), NOW);

    expect(response.items.map((item) => item.platforms)).toEqual([
      ['instagram', 'tiktok'],
      [],
      [],
    ]);
  });

  it('lets the database narrow by type', async () => {
    const { client, service } = stub([]);

    await service.list(CREATOR_ID, query({ types: ['specific'] }), NOW);

    expect(client.contents.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ...OWN, type: { in: ['specific'] } },
      }),
    );
  });

  it('lets the database narrow by period, but keeps every row of Perlu Dikerjakan whatever its deadline', async () => {
    const { client, service } = stub([]);

    await service.list(
      CREATOR_ID,
      query({ deadlineFrom: '2026-10-01', deadlineTo: '2026-10-31' }),
      NOW,
    );

    expect(client.contents.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          ...OWN,
          OR: [
            {
              deadline: {
                gte: new Date('2026-10-01T00:00:00.000Z'),
                lte: new Date('2026-10-31T00:00:00.000Z'),
              },
            },
            {
              status: { in: ['scheduled', 'draft_revision', 'draft_approved'] },
            },
            // Today is 10 October in WIB, so the H-1 link is open on a deadline up to the 11th.
            {
              status: 'draft_review',
              deadline: { lte: new Date('2026-10-11T00:00:00.000Z') },
            },
          ],
        },
      }),
    );
  });

  it('reads an open-ended period with only the end it was given', async () => {
    const { client, service } = stub([]);

    await service.list(CREATOR_ID, query({ deadlineTo: '2026-10-31' }), NOW);

    expect(client.contents.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { deadline: { lte: new Date('2026-10-31T00:00:00.000Z') } },
            expect.anything(),
            expect.anything(),
          ],
        }),
      }),
    );
  });

  // Finished work has the oldest deadlines, so sorted in with the rest it would fill the first
  // page of Semua and push what the creator still has to deliver behind it.
  it('lists open work first, nearest deadline first, and finished work after it', async () => {
    const { service } = stub([
      row({ id: 'later', deadline: '2026-11-15' }),
      row({
        id: 'done-old',
        deadline: '2026-09-01',
        status: 'link_submitted',
        linkDay: '2026-09-01',
      }),
      row({
        id: 'done',
        deadline: '2026-10-01',
        status: 'link_submitted',
        linkDay: '2026-10-01',
      }),
      row({ id: 'sooner', deadline: '2026-10-20', status: 'draft_review' }),
    ]);

    expect(ids(await service.list(CREATOR_ID, query(), NOW))).toEqual([
      'sooner',
      'later',
      'done-old',
      'done',
    ]);
  });

  it('keeps open work ahead of finished work when the furthest deadline is asked first', async () => {
    const { service } = stub([
      row({
        id: 'done',
        deadline: '2026-12-01',
        status: 'link_submitted',
        linkDay: '2026-12-01',
      }),
      row({ id: 'sooner', deadline: '2026-10-20' }),
      row({
        id: 'done-old',
        deadline: '2026-09-01',
        status: 'link_submitted',
        linkDay: '2026-09-01',
      }),
      row({ id: 'later', deadline: '2026-11-15' }),
    ]);

    const response = await service.list(
      CREATOR_ID,
      query({ sort: 'deadline_desc' }),
      NOW,
    );

    expect(ids(response)).toEqual(['later', 'sooner', 'done', 'done-old']);
  });

  it('pages across the two blocks as one list', async () => {
    const { service } = stub([
      row({
        id: 'done',
        deadline: '2026-10-01',
        status: 'link_submitted',
        linkDay: '2026-10-01',
      }),
      row({ id: 'open-a', deadline: '2026-10-20' }),
      row({ id: 'open-b', deadline: '2026-10-21' }),
    ]);

    const second = await service.list(
      CREATOR_ID,
      query({}, { page: 2, pageSize: 2 }),
      NOW,
    );

    expect(ids(second)).toEqual(['done']);
    expect(second).toMatchObject({ total: 3, totalPages: 2 });
  });

  it('turns the order around when the furthest deadline is asked first', async () => {
    const { service } = stub([
      row({ id: 'sooner', deadline: '2026-10-20' }),
      row({ id: 'later', deadline: '2026-11-15' }),
    ]);

    const response = await service.list(
      CREATOR_ID,
      query({ sort: 'deadline_desc' }),
      NOW,
    );

    expect(ids(response)).toEqual(['later', 'sooner']);
  });

  it('keeps rows sharing a deadline in name then id order, so a page never reshuffles', async () => {
    const { service } = stub([
      row({ id: 'b', name: 'Unboxing' }),
      row({ id: 'c', name: 'Haul' }),
      row({ id: 'a', name: 'Unboxing' }),
    ]);

    expect(ids(await service.list(CREATOR_ID, query(), NOW))).toEqual([
      'c',
      'a',
      'b',
    ]);
  });

  it.each([
    ['to_do', ['s', 'rev', 'ok']],
    ['waiting_admin', ['review']],
    ['done', ['link']],
    ['all', ['s', 'review', 'rev', 'ok', 'link']],
  ] as const)('shows only the %s tab’s rows', async (tab, expected) => {
    const { service } = stub([
      row({ id: 's', status: 'scheduled', deadline: '2026-10-21' }),
      row({ id: 'review', status: 'draft_review', deadline: '2026-10-22' }),
      row({ id: 'rev', status: 'draft_revision', deadline: '2026-10-23' }),
      row({ id: 'ok', status: 'draft_approved', deadline: '2026-10-24' }),
      row({
        id: 'link',
        status: 'link_submitted',
        deadline: '2026-10-25',
        linkDay: '2026-10-25',
      }),
    ]);

    expect(ids(await service.list(CREATOR_ID, query({ tab }), NOW))).toEqual(
      expected,
    );
  });

  // The H-1 link skips the approval, so from then on the next move is the creator's too.
  it.each([
    ['the day before its deadline', '2026-10-11'],
    ['on its deadline', '2026-10-10'],
    ['past its deadline', '2026-10-08'],
  ])(
    'moves a draft in review to Perlu Dikerjakan %s, when its link can be sent',
    async (_label, deadline) => {
      const { service } = stub([
        row({ id: 'review-h1', status: 'draft_review', deadline }),
        row({
          id: 'review-far',
          status: 'draft_review',
          deadline: '2026-10-12',
        }),
      ]);

      const toDo = await service.list(CREATOR_ID, query({ tab: 'to_do' }), NOW);
      const waiting = await service.list(
        CREATOR_ID,
        query({ tab: 'waiting_admin' }),
        NOW,
      );

      expect(ids(toDo)).toEqual(['review-h1']);
      expect(toDo.items[0].actions).toEqual(['submit_video']);
      expect(ids(waiting)).toEqual(['review-far']);
      expect(toDo.tabCounts).toEqual({
        all: 2,
        to_do: 1,
        waiting_admin: 1,
        done: 0,
      });
    },
  );

  it('keeps a draft in review whose link can be sent in Perlu Dikerjakan whatever the period', async () => {
    const { service } = stub([
      row({ id: 'review-h1', status: 'draft_review', deadline: '2026-10-11' }),
    ]);
    const period = { deadlineFrom: '2026-11-01', deadlineTo: '2026-11-30' };

    const semua = await service.list(CREATOR_ID, query(period), NOW);
    const toDo = await service.list(
      CREATOR_ID,
      query({ ...period, tab: 'to_do' }),
      NOW,
    );

    expect(ids(semua)).toEqual([]);
    expect(ids(toDo)).toEqual(['review-h1']);
    expect(toDo.tabCounts).toEqual({
      all: 0,
      to_do: 1,
      waiting_admin: 0,
      done: 0,
    });
  });

  it('counts every tab whichever is open, so the badges never change with the tab', async () => {
    const { service } = stub([
      row({ status: 'scheduled' }),
      row({ status: 'draft_revision' }),
      row({ status: 'draft_review' }),
      row({ status: 'link_submitted', linkDay: '2026-10-01' }),
    ]);

    const response = await service.list(
      CREATOR_ID,
      query({ tab: 'done' }),
      NOW,
    );

    expect(response.tabCounts).toEqual({
      all: 4,
      to_do: 2,
      waiting_admin: 1,
      done: 1,
    });
    expect(response.total).toBe(1);
  });

  it('narrows the rows by status, but counts the tabs without it', async () => {
    const { service } = stub([
      row({ id: 's', status: 'scheduled' }),
      row({ id: 'rev', status: 'draft_revision' }),
    ]);

    const response = await service.list(
      CREATOR_ID,
      query({ tab: 'to_do', statuses: ['draft_revision'] }),
      NOW,
    );

    expect(ids(response)).toEqual(['rev']);
    expect(response.total).toBe(1);
    expect(response.tabCounts.to_do).toBe(2);
  });

  it('searches the content name whatever its case, and counts only what it finds', async () => {
    const { service } = stub([
      row({ id: 'hit', name: 'Unboxing Serum' }),
      row({ id: 'brief-only', name: 'Haul', brief: 'unboxing serum' }),
    ]);

    const response = await service.list(CREATOR_ID, query({ q: 'UNBOX' }), NOW);

    expect(ids(response)).toEqual(['hit']);
    expect(response.tabCounts.all).toBe(1);
  });

  it.each([
    [true, ['overdue', 'late']],
    [false, ['open', 'on-time']],
  ])(
    'keeps overdue=%s rows by the same tags the row shows',
    async (overdue, expected) => {
      const { service } = stub([
        row({
          id: 'overdue',
          status: 'draft_revision',
          deadline: '2026-10-05',
        }),
        row({
          id: 'late',
          status: 'link_submitted',
          deadline: '2026-10-04',
          linkDay: '2026-10-07',
        }),
        row({
          id: 'on-time',
          status: 'link_submitted',
          deadline: '2026-10-06',
          linkDay: '2026-10-05',
        }),
        row({ id: 'open', status: 'scheduled', deadline: '2026-10-30' }),
      ]);

      const response = await service.list(CREATOR_ID, query({ overdue }), NOW);

      expect(ids(response)).toEqual(expected);
      expect(response.tabCounts.all).toBe(2);
    },
  );

  it('leaves a row outside the period out of Semua and its counter, but keeps work to do in Perlu Dikerjakan', async () => {
    // The database hands back the to-do row outside the period because of the OR above.
    const { service } = stub([
      row({ id: 'todo-old', status: 'scheduled', deadline: '2026-09-01' }),
      row({ id: 'review-in', status: 'draft_review', deadline: '2026-10-15' }),
    ]);
    const period = { deadlineFrom: '2026-10-01', deadlineTo: '2026-10-31' };

    const semua = await service.list(CREATOR_ID, query(period), NOW);
    const toDo = await service.list(
      CREATOR_ID,
      query({ ...period, tab: 'to_do' }),
      NOW,
    );

    expect(ids(semua)).toEqual(['review-in']);
    expect(ids(toDo)).toEqual(['todo-old']);
    expect(semua.tabCounts).toEqual({
      all: 1,
      to_do: 1,
      waiting_admin: 1,
      done: 0,
    });
  });

  it('keeps every other tab to the period, rows and counter alike', async () => {
    // A row the database would not return, handed back anyway: the period still decides.
    const { service } = stub([
      row({
        id: 'review-later',
        status: 'draft_review',
        deadline: '2026-12-01',
      }),
      row({
        id: 'done-old',
        status: 'link_submitted',
        deadline: '2026-09-02',
        linkDay: '2026-09-02',
      }),
    ]);
    const period = { deadlineFrom: '2026-10-01', deadlineTo: '2026-10-31' };

    const waiting = await service.list(
      CREATOR_ID,
      query({ ...period, tab: 'waiting_admin' }),
      NOW,
    );

    expect(ids(waiting)).toEqual([]);
    expect(waiting.tabCounts).toEqual({
      all: 0,
      to_do: 0,
      waiting_admin: 0,
      done: 0,
    });
  });

  it('keeps both ends of the period inclusive', async () => {
    const { service } = stub([
      row({
        id: 'before',
        status: 'link_submitted',
        deadline: '2026-09-30',
        linkDay: '2026-09-30',
      }),
      row({
        id: 'first',
        status: 'link_submitted',
        deadline: '2026-10-01',
        linkDay: '2026-10-01',
      }),
      row({ id: 'last', status: 'draft_review', deadline: '2026-10-31' }),
      row({ id: 'after', status: 'draft_review', deadline: '2026-11-01' }),
    ]);

    const response = await service.list(
      CREATOR_ID,
      query({ deadlineFrom: '2026-10-01', deadlineTo: '2026-10-31' }),
      NOW,
    );

    expect(ids(response)).toEqual(['last', 'first']);
  });

  it('maps a row into API vocabulary with its actions for today in WIB', async () => {
    const { service } = stub([
      row({
        id: 'c1',
        name: 'Unboxing',
        type: 'specific',
        brief: 'Tunjukkan kemasan',
        deadline: '2026-10-11',
        status: 'draft_review',
      }),
    ]);

    const response = await service.list(CREATOR_ID, query(), NOW);

    // In WIB today is 10 October, so an 11 October deadline is already H-1; in UTC it would not be.
    expect(response.items).toEqual([
      {
        id: 'c1',
        name: 'Unboxing',
        type: 'specific',
        brief: 'Tunjukkan kemasan',
        deadline: '2026-10-11',
        status: 'draft_review',
        tags: [],
        actions: ['submit_video'],
        revisionNotes: null,
      },
    ]);
  });

  it('flags each row with the same tags the admin sees, judged on today in WIB', async () => {
    const { service } = stub([
      row({ id: 'overdue', status: 'draft_revision', deadline: '2026-10-05' }),
      row({
        id: 'late-bypassed',
        status: 'link_submitted',
        deadline: '2026-10-06',
        linkDay: '2026-10-07',
        approval_bypassed: true,
      }),
      row({
        id: 'on-time',
        status: 'link_submitted',
        deadline: '2026-10-07',
        linkDay: '2026-10-07',
      }),
    ]);

    const { items } = await service.list(CREATOR_ID, query(), NOW);

    expect(items.map((item) => [item.id, item.tags])).toEqual([
      ['overdue', ['overdue']],
      ['late-bypassed', ['overdue', 'approval_bypassed']],
      ['on-time', []],
    ]);
  });

  it("carries the admin's latest revision notes on a row waiting for a resubmit", async () => {
    const { service } = stub([
      row({
        id: 'c1',
        status: 'draft_revision',
        revisionNotes: 'Perjelas intro',
      }),
    ]);

    const [item] = (await service.list(CREATOR_ID, query(), NOW)).items;

    expect(item.revisionNotes).toBe('Perjelas intro');
  });

  it('leaves out revision notes once the revision has been handed in or approved', async () => {
    const { service } = stub([
      row({
        id: 'c1',
        status: 'draft_review',
        revisionNotes: 'Perjelas intro',
      }),
      row({
        id: 'c2',
        status: 'draft_approved',
        revisionNotes: 'Perjelas intro',
      }),
    ]);

    const { items } = await service.list(CREATOR_ID, query(), NOW);

    expect(items.map((item) => item.revisionNotes)).toEqual([null, null]);
  });

  it('answers null revision notes when the revision request left none', async () => {
    const { service } = stub([
      row({ id: 'c1', status: 'draft_revision', revisionNotes: null }),
      row({ id: 'c2', status: 'draft_revision' }),
    ]);

    const { items } = await service.list(CREATOR_ID, query(), NOW);

    expect(items.map((item) => item.revisionNotes)).toEqual([null, null]);
  });

  it('gives a submitted link no actions', async () => {
    const { service } = stub([
      row({ status: 'link_submitted', linkDay: '2026-10-01' }),
    ]);

    const [item] = (await service.list(CREATOR_ID, query(), NOW)).items;

    expect(item.actions).toEqual([]);
  });

  it('cuts the requested page out of the sorted rows and reports totals across every page', async () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      row({
        id: `c${String(i).padStart(2, '0')}`,
        deadline: `2026-10-${String(i + 11)}`,
      }),
    );
    const { service } = stub(rows);

    const second = await service.list(
      CREATOR_ID,
      query({}, { page: 2, pageSize: 10 }),
      NOW,
    );

    expect(ids(second)).toEqual(['c10', 'c11']);
    expect(second).toMatchObject({
      page: 2,
      pageSize: 10,
      total: 12,
      totalPages: 2,
    });
  });

  it('answers an empty list with one empty page and every counter at zero', async () => {
    const { service } = stub([]);

    expect(await service.list(CREATOR_ID, query(), NOW)).toEqual({
      items: [],
      page: 1,
      pageSize: 10,
      total: 0,
      totalPages: 1,
      tabCounts: { all: 0, to_do: 0, waiting_admin: 0, done: 0 },
    });
  });

  it('answers a page past the end with no rows rather than an error', async () => {
    const { service } = stub([row({})]);

    const response = await service.list(
      CREATOR_ID,
      query({}, { page: 3, pageSize: 10 }),
      NOW,
    );

    expect(response).toMatchObject({
      items: [],
      page: 3,
      total: 1,
      totalPages: 1,
    });
  });
});
