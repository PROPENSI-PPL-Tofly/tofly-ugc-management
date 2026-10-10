import type { ContentListFilters } from './content-list.js';
import {
  ContentListService,
  type ContentListClient,
  type ContentListRow,
} from './content-list.service.js';

// 22:30 on 10 October in Jakarta: a deadline of the 9th has passed, one of the 10th has not.
const NOW = new Date('2026-10-10T15:30:00.000Z');
const PAGE = { page: 1, pageSize: 10 };
const EVERYTHING: ContentListFilters = { tab: 'all', sort: 'deadline_asc' };

const DINA = '0f9c2f5e-6b1a-4f3e-9a51-3c1d2e4b5a60';
const RAKA = '11111111-1111-4111-8111-111111111111';

let seq = 0;

function row(
  overrides: {
    name?: string;
    status?: ContentListRow['status'];
    type?: ContentListRow['type'];
    deadline?: string;
    creator?: ContentListRow['contracts']['creators'];
    /** How many drafts were handed in; none by default. */
    handIns?: number;
    /** How many of those hand-ins an admin answered with a revision request; none by default. */
    revisionsAsked?: number;
    latestDraftAt?: string;
    videoSubmittedAt?: string;
    approvalBypassed?: boolean;
  } = {},
): ContentListRow {
  seq += 1;
  const handIns = overrides.handIns ?? 0;
  return {
    id: `content-${String(seq).padStart(2, '0')}`,
    name: overrides.name ?? `Konten ${seq}`,
    type: overrides.type ?? 'specific',
    deadline: new Date(`${overrides.deadline ?? '2026-10-20'}T00:00:00.000Z`),
    status: overrides.status ?? 'scheduled',
    video_submitted_at: overrides.videoSubmittedAt
      ? new Date(`${overrides.videoSubmittedAt}T00:00:00.000Z`)
      : null,
    approval_bypassed: overrides.approvalBypassed ?? false,
    contracts: {
      creators: overrides.creator ?? {
        id: DINA,
        first_name: 'Dina',
        middle_name: null,
        last_name: 'Putri',
      },
    },
    submissions:
      handIns > 0
        ? [
            {
              created_at: new Date(
                overrides.latestDraftAt ?? '2026-10-01T08:00:00.000Z',
              ),
            },
          ]
        : [],
    // What the query counts: only the hand-ins that carry a revision request.
    _count: { submissions: overrides.revisionsAsked ?? 0 },
  };
}

function stub(rows: ContentListRow[]) {
  const client = {
    contents: { findMany: vi.fn().mockResolvedValue(rows) },
  } satisfies ContentListClient;
  return { client, service: new ContentListService(client) };
}

async function names(
  rows: ContentListRow[],
  filters: Partial<ContentListFilters>,
) {
  const { service } = stub(rows);
  const answer = await service.list(PAGE, NOW, { ...EVERYTHING, ...filters });
  return answer.items.map((item) => item.name);
}

describe('ContentListService.list', () => {
  beforeEach(() => {
    seq = 0;
  });

  it('reads only what the table shows and what its tags are judged on', async () => {
    const { client, service } = stub([]);

    await service.list(PAGE, NOW, EVERYTHING);

    expect(client.contents.findMany).toHaveBeenCalledWith({
      where: {},
      select: {
        id: true,
        name: true,
        type: true,
        deadline: true,
        status: true,
        video_submitted_at: true,
        approval_bypassed: true,
        contracts: {
          select: {
            creators: {
              select: {
                id: true,
                first_name: true,
                middle_name: true,
                last_name: true,
              },
            },
          },
        },
        submissions: {
          orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
          take: 1,
          select: { created_at: true },
        },
        _count: {
          select: {
            submissions: { where: { revision_notes: { not: null } } },
          },
        },
      },
    });
  });

  describe('a row', () => {
    it('carries the content, its creator and its deadline as a calendar day', async () => {
      const { service } = stub([
        row({
          name: 'Unboxing Serum',
          type: 'evergreen',
          status: 'draft_review',
          deadline: '2026-10-21',
          handIns: 1,
          creator: {
            id: RAKA,
            first_name: 'Raka',
            middle_name: 'Adi',
            last_name: 'Wijaya',
          },
        }),
      ]);

      const answer = await service.list(PAGE, NOW, EVERYTHING);

      expect(answer.items).toEqual([
        {
          id: 'content-01',
          name: 'Unboxing Serum',
          creatorId: RAKA,
          creatorName: 'Raka Adi Wijaya',
          type: 'evergreen',
          deadline: '2026-10-21',
          status: 'draft_review',
          tags: [],
          revisionCount: 0,
        },
      ]);
    });

    it.each([
      ['nothing when no draft was handed in', 'scheduled', 0, 0],
      [
        'nothing for a first draft still waiting for review',
        'draft_review',
        1,
        0,
      ],
      [
        'one once a revision is asked for, before the creator hands in again',
        'draft_revision',
        1,
        1,
      ],
      ['one after that revision is handed in', 'draft_review', 2, 1],
      ['two for a draft sent back twice', 'draft_revision', 2, 2],
    ] as const)(
      'counts the revisions an admin asked for: %s',
      async (_, status, handIns, revisionsAsked) => {
        const { service } = stub([row({ status, handIns, revisionsAsked })]);

        const answer = await service.list(PAGE, NOW, EVERYTHING);

        expect(answer.items[0].revisionCount).toBe(revisionsAsked);
      },
    );

    it('is tagged overdue once its deadline day has passed without a link', async () => {
      const { service } = stub([row({ deadline: '2026-10-09' })]);

      const answer = await service.list(PAGE, NOW, EVERYTHING);

      expect(answer.items[0].tags).toEqual(['overdue']);
    });

    it('is not overdue on the deadline day itself, late as the hour is', async () => {
      const { service } = stub([row({ deadline: '2026-10-10' })]);

      const answer = await service.list(PAGE, NOW, EVERYTHING);

      expect(answer.items[0].tags).toEqual([]);
    });

    it('is tagged late when its latest draft came in after the deadline day', async () => {
      const { service } = stub([
        row({
          status: 'draft_review',
          deadline: '2026-10-12',
          handIns: 1,
          latestDraftAt: '2026-10-13T02:00:00.000Z',
        }),
      ]);

      const answer = await service.list(
        PAGE,
        new Date('2026-10-13T03:00:00.000Z'),
        EVERYTHING,
      );

      expect(answer.items[0].tags).toEqual(['late_submission', 'overdue']);
    });

    it('is tagged late and bypassed from its stored link day and bypass flag', async () => {
      const { service } = stub([
        row({
          status: 'link_submitted',
          deadline: '2026-10-05',
          videoSubmittedAt: '2026-10-06',
          approvalBypassed: true,
        }),
      ]);

      const answer = await service.list(PAGE, NOW, EVERYTHING);

      expect(answer.items[0].tags).toEqual([
        'late_submission',
        'approval_bypassed',
      ]);
    });
  });

  describe('tabs', () => {
    function oneOfEach() {
      return [
        row({ name: 'Usulan', status: 'pending', deadline: '2026-10-21' }),
        row({ name: 'Terjadwal', status: 'scheduled', deadline: '2026-10-22' }),
        row({
          name: 'Menunggu Review',
          status: 'draft_review',
          deadline: '2026-10-23',
          handIns: 1,
        }),
        row({
          name: 'Perlu Revisi',
          status: 'draft_revision',
          deadline: '2026-10-24',
          handIns: 1,
        }),
        row({
          name: 'Disetujui',
          status: 'draft_approved',
          deadline: '2026-10-25',
          handIns: 1,
        }),
        row({
          name: 'Selesai',
          status: 'link_submitted',
          deadline: '2026-10-26',
          videoSubmittedAt: '2026-10-08',
        }),
      ];
    }

    it.each([
      [
        'all',
        [
          'Usulan',
          'Terjadwal',
          'Menunggu Review',
          'Perlu Revisi',
          'Disetujui',
          'Selesai',
        ],
      ],
      ['needs_approval', ['Usulan', 'Menunggu Review']],
      ['waiting_creator', ['Terjadwal', 'Perlu Revisi', 'Disetujui']],
      ['done', ['Selesai']],
    ] as const)('lists the %s tab', async (tab, expected) => {
      expect(await names(oneOfEach(), { tab })).toEqual(expected);
    });

    it.each(['all', 'needs_approval', 'waiting_creator', 'done'] as const)(
      'counts every tab the same whichever tab is open (%s)',
      async (tab) => {
        const { service } = stub(oneOfEach());

        const answer = await service.list(PAGE, NOW, { ...EVERYTHING, tab });

        expect(answer.tabCounts).toEqual({
          all: 6,
          needs_approval: 2,
          waiting_creator: 3,
          done: 1,
        });
      },
    );

    it('totals the open tab, not every content', async () => {
      const { service } = stub(oneOfEach());

      const answer = await service.list(PAGE, NOW, {
        ...EVERYTHING,
        tab: 'waiting_creator',
      });

      expect(answer.total).toBe(3);
    });

    it('counts the tabs under the search and filters in force', async () => {
      const { service } = stub([
        row({ name: 'Serum pagi', status: 'pending' }),
        row({ name: 'Serum malam', status: 'scheduled' }),
        row({ name: 'Toner', status: 'draft_review', handIns: 1 }),
      ]);

      const answer = await service.list(PAGE, NOW, {
        ...EVERYTHING,
        tab: 'done',
        q: 'serum',
      });

      expect(answer.tabCounts).toEqual({
        all: 2,
        needs_approval: 1,
        waiting_creator: 1,
        done: 0,
      });
      expect(answer.items).toEqual([]);
      expect(answer.total).toBe(0);
    });

    it('narrows the rows by a status filter and leaves every counter as it was', async () => {
      const { service } = stub([
        row({ name: 'Usulan', status: 'pending' }),
        row({ name: 'Terjadwal', status: 'scheduled' }),
        row({ name: 'Menunggu Review', status: 'draft_review', handIns: 1 }),
      ]);

      const answer = await service.list(PAGE, NOW, {
        ...EVERYTHING,
        tab: 'needs_approval',
        statuses: ['pending', 'scheduled'],
      });

      // The tab is narrowed, never widened: Terjadwal sits under another tab.
      expect(answer.items.map((item) => item.name)).toEqual(['Usulan']);
      expect(answer.total).toBe(1);
      expect(answer.tabCounts).toEqual({
        all: 3,
        needs_approval: 2,
        waiting_creator: 1,
        done: 0,
      });
    });

    describe('under a deadline period', () => {
      const PERIOD = { deadlineFrom: '2026-10-12', deadlineTo: '2026-10-18' };
      const rows = () => [
        row({ name: 'Usulan lama', status: 'pending', deadline: '2026-09-01' }),
        row({
          name: 'Review nanti',
          status: 'draft_review',
          deadline: '2026-12-01',
          handIns: 1,
        }),
        row({
          name: 'Review minggu ini',
          status: 'draft_review',
          deadline: '2026-10-15',
          handIns: 1,
        }),
        row({ name: 'Terjadwal minggu ini', deadline: '2026-10-14' }),
        row({ name: 'Terjadwal nanti', deadline: '2026-12-02' }),
        row({
          name: 'Selesai lama',
          status: 'link_submitted',
          deadline: '2026-09-02',
          videoSubmittedAt: '2026-09-01',
        }),
      ];

      it('still lists everything that waits for approval, whatever its deadline', async () => {
        expect(
          await names(rows(), { ...PERIOD, tab: 'needs_approval' }),
        ).toEqual(['Usulan lama', 'Review minggu ini', 'Review nanti']);
      });

      it('keeps the other tabs to the period', async () => {
        expect(
          await names(rows(), { ...PERIOD, tab: 'waiting_creator' }),
        ).toEqual(['Terjadwal minggu ini']);
        expect(await names(rows(), { ...PERIOD, tab: 'done' })).toEqual([]);
      });

      it('keeps Semua to the period too, approval rows included', async () => {
        expect(await names(rows(), { ...PERIOD, tab: 'all' })).toEqual([
          'Terjadwal minggu ini',
          'Review minggu ini',
        ]);
      });

      it.each(['all', 'needs_approval', 'waiting_creator', 'done'] as const)(
        'counts Perlu Approval in full and the other tabs within the period (%s open)',
        async (tab) => {
          const { service } = stub(rows());

          const answer = await service.list(PAGE, NOW, {
            ...EVERYTHING,
            ...PERIOD,
            tab,
          });

          expect(answer.tabCounts).toEqual({
            all: 2,
            needs_approval: 3,
            waiting_creator: 1,
            done: 0,
          });
        },
      );
    });
  });

  describe('search', () => {
    const rows = () => [
      row({ name: 'Unboxing Serum' }),
      row({
        name: 'Review Toner',
        creator: {
          id: RAKA,
          first_name: 'Raka',
          middle_name: 'Adi',
          last_name: 'Wijaya',
        },
      }),
    ];

    it('finds a content by part of its name, whatever the case', async () => {
      expect(await names(rows(), { q: 'SERUM' })).toEqual(['Unboxing Serum']);
    });

    it('finds a content by its creator, across the parts of the name', async () => {
      expect(await names(rows(), { q: 'adi wijaya' })).toEqual([
        'Review Toner',
      ]);
    });

    it('lists nothing when neither name holds the text', async () => {
      expect(await names(rows(), { q: 'sunscreen' })).toEqual([]);
    });
  });

  describe('filters', () => {
    it('keeps the contents in any named status', async () => {
      const rows = [
        row({ name: 'Disetujui', status: 'draft_approved', handIns: 1 }),
        row({ name: 'Terjadwal', status: 'scheduled' }),
        row({ name: 'Usulan', status: 'pending' }),
      ];

      expect(
        await names(rows, { statuses: ['pending', 'draft_approved'] }),
      ).toEqual(['Disetujui', 'Usulan']);
    });

    describe('overdue', () => {
      const rows = () => [
        row({ name: 'Lewat, terjadwal', deadline: '2026-10-01' }),
        // Past its deadline but nobody committed to a proposal, so it is not overdue.
        row({
          name: 'Lewat, usulan',
          status: 'pending',
          deadline: '2026-10-02',
        }),
        // Its link came in after the deadline: the lateness stays with it once it is done.
        row({
          name: 'Selesai terlambat',
          status: 'link_submitted',
          deadline: '2026-10-03',
          videoSubmittedAt: '2026-10-05',
        }),
        row({
          name: 'Selesai tepat waktu',
          status: 'link_submitted',
          deadline: '2026-10-04',
          videoSubmittedAt: '2026-10-04',
        }),
        row({ name: 'Belum lewat', deadline: '2026-10-30' }),
      ];

      it('keeps what is past its deadline and what was finished late for true', async () => {
        const { service } = stub(rows());

        const answer = await service.list(PAGE, NOW, {
          ...EVERYTHING,
          overdue: true,
        });

        expect(answer.items.map((item) => [item.name, item.tags])).toEqual([
          ['Lewat, terjadwal', ['overdue']],
          ['Selesai terlambat', ['late_submission']],
        ]);
        expect(answer.tabCounts).toEqual({
          all: 2,
          needs_approval: 0,
          waiting_creator: 1,
          done: 1,
        });
      });

      it('keeps everything else for false', async () => {
        expect(await names(rows(), { overdue: false })).toEqual([
          'Lewat, usulan',
          'Selesai tepat waktu',
          'Belum lewat',
        ]);
      });

      it('keeps all of it when the filter is left out', async () => {
        expect(await names(rows(), {})).toHaveLength(5);
      });
    });

    it('keeps deadlines from the first day of the period through the last', async () => {
      const rows = [
        row({ name: 'Sehari sebelum', deadline: '2026-10-11' }),
        row({ name: 'Hari pertama', deadline: '2026-10-12' }),
        row({ name: 'Hari terakhir', deadline: '2026-10-18' }),
        row({ name: 'Sehari sesudah', deadline: '2026-10-19' }),
      ];

      expect(
        await names(rows, {
          deadlineFrom: '2026-10-12',
          deadlineTo: '2026-10-18',
        }),
      ).toEqual(['Hari pertama', 'Hari terakhir']);
    });

    it('keeps everything from a start day on when no end is named', async () => {
      const rows = [
        row({ name: 'Sebelum', deadline: '2026-10-11' }),
        row({ name: 'Sesudah', deadline: '2026-12-01' }),
      ];

      expect(await names(rows, { deadlineFrom: '2026-10-12' })).toEqual([
        'Sesudah',
      ]);
    });

    it('keeps everything up to an end day when no start is named', async () => {
      const rows = [
        row({ name: 'Sebelum', deadline: '2026-10-11' }),
        row({ name: 'Sesudah', deadline: '2026-12-01' }),
      ];

      expect(await names(rows, { deadlineTo: '2026-10-12' })).toEqual([
        'Sebelum',
      ]);
    });

    it('keeps only what passes every filter at once', async () => {
      const rows = [
        row({ name: 'Serum A', status: 'draft_review', handIns: 1 }),
        row({
          name: 'Serum B',
          status: 'draft_review',
          handIns: 1,
          deadline: '2026-10-01',
        }),
        row({ name: 'Toner A', status: 'draft_review', handIns: 1 }),
        row({ name: 'Serum C', status: 'scheduled' }),
      ];

      expect(
        await names(rows, {
          q: 'serum',
          statuses: ['draft_review'],
          overdue: false,
        }),
      ).toEqual(['Serum A']);
    });
  });

  describe('what it asks the database for', () => {
    const other = '22222222-2222-4222-8222-222222222222';

    async function where(filters: Partial<ContentListFilters>) {
      const { client, service } = stub([]);
      await service.list(PAGE, NOW, { ...EVERYTHING, ...filters });
      return client.contents.findMany.mock.calls[0][0].where;
    }

    it('narrows to the named creators through their contracts', async () => {
      expect(await where({ creators: [DINA, other] })).toEqual({
        contracts: { creator_id: { in: [DINA, other] } },
      });
    });

    it('narrows to the named types', async () => {
      expect(await where({ types: ['evergreen'] })).toEqual({
        type: { in: ['evergreen'] },
      });
    });

    it('narrows to the period, and still reads everything that waits for approval', async () => {
      expect(
        await where({ deadlineFrom: '2026-10-12', deadlineTo: '2026-10-18' }),
      ).toEqual({
        OR: [
          {
            deadline: {
              gte: new Date('2026-10-12T00:00:00.000Z'),
              lte: new Date('2026-10-18T00:00:00.000Z'),
            },
          },
          { status: { in: ['pending', 'draft_review'] } },
        ],
      });
    });

    it('narrows from a start day alone', async () => {
      expect(await where({ deadlineFrom: '2026-10-12' })).toEqual({
        OR: [
          { deadline: { gte: new Date('2026-10-12T00:00:00.000Z') } },
          { status: { in: ['pending', 'draft_review'] } },
        ],
      });
    });

    it('narrows up to an end day alone', async () => {
      expect(await where({ deadlineTo: '2026-10-18' })).toEqual({
        OR: [
          { deadline: { lte: new Date('2026-10-18T00:00:00.000Z') } },
          { status: { in: ['pending', 'draft_review'] } },
        ],
      });
    });

    it('narrows by all three at once', async () => {
      expect(
        await where({
          creators: [DINA],
          types: ['specific', 'evergreen'],
          deadlineTo: '2026-10-18',
        }),
      ).toEqual({
        contracts: { creator_id: { in: [DINA] } },
        type: { in: ['specific', 'evergreen'] },
        OR: [
          { deadline: { lte: new Date('2026-10-18T00:00:00.000Z') } },
          { status: { in: ['pending', 'draft_review'] } },
        ],
      });
    });

    it('leaves the search, the status filter, overdue and the tab out of the query', async () => {
      expect(
        await where({
          tab: 'done',
          q: 'serum',
          statuses: ['link_submitted'],
          overdue: true,
        }),
      ).toEqual({});
    });
  });

  describe('order', () => {
    const rows = () => [
      row({ name: 'Akhir', deadline: '2026-10-30' }),
      row({ name: 'Awal', deadline: '2026-10-11' }),
      row({ name: 'Tengah', deadline: '2026-10-20' }),
    ];

    it('lists the nearest deadline first', async () => {
      expect(await names(rows(), { sort: 'deadline_asc' })).toEqual([
        'Awal',
        'Tengah',
        'Akhir',
      ]);
    });

    it('lists the furthest deadline first when asked', async () => {
      expect(await names(rows(), { sort: 'deadline_desc' })).toEqual([
        'Akhir',
        'Tengah',
        'Awal',
      ]);
    });

    it.each(['deadline_asc', 'deadline_desc'] as const)(
      'keeps contents sharing a deadline in name order, then id, under %s',
      async (sort) => {
        const sameDay = [
          row({ name: 'Beta' }),
          row({ name: 'Alfa' }),
          row({ name: 'Alfa' }),
        ];
        const { service } = stub(sameDay);

        const answer = await service.list(PAGE, NOW, { ...EVERYTHING, sort });

        expect(answer.items.map((item) => [item.name, item.id])).toEqual([
          ['Alfa', 'content-02'],
          ['Alfa', 'content-03'],
          ['Beta', 'content-01'],
        ]);
      },
    );
  });

  describe('paging', () => {
    function many(count: number) {
      return Array.from({ length: count }, (_, index) =>
        row({
          name: `Konten ${String(index + 1).padStart(2, '0')}`,
          deadline: `2026-11-${String(index + 1).padStart(2, '0')}`,
        }),
      );
    }

    it('answers the asked page of the sorted list with its totals', async () => {
      const { service } = stub(many(25));

      const answer = await service.list(
        { page: 2, pageSize: 10 },
        NOW,
        EVERYTHING,
      );

      expect(answer.items.map((item) => item.name)).toEqual(
        Array.from({ length: 10 }, (_, index) => `Konten ${index + 11}`),
      );
      expect(answer).toMatchObject({
        page: 2,
        pageSize: 10,
        total: 25,
        totalPages: 3,
      });
    });

    it('answers the short last page', async () => {
      const { service } = stub(many(25));

      const answer = await service.list(
        { page: 3, pageSize: 10 },
        NOW,
        EVERYTHING,
      );

      expect(answer.items).toHaveLength(5);
    });

    it('answers no rows past the last page and still the real totals', async () => {
      const { service } = stub(many(5));

      const answer = await service.list(
        { page: 4, pageSize: 10 },
        NOW,
        EVERYTHING,
      );

      expect(answer.items).toEqual([]);
      expect(answer).toMatchObject({ total: 5, totalPages: 1 });
    });

    it('fills a page exactly without promising another', async () => {
      const { service } = stub(many(20));

      const answer = await service.list(PAGE, NOW, EVERYTHING);

      expect(answer.totalPages).toBe(2);
    });

    it('answers one empty page when there is no content at all', async () => {
      const { service } = stub([]);

      const answer = await service.list(PAGE, NOW, EVERYTHING);

      expect(answer).toEqual({
        items: [],
        page: 1,
        pageSize: 10,
        total: 0,
        totalPages: 1,
        tabCounts: { all: 0, needs_approval: 0, waiting_creator: 0, done: 0 },
      });
    });
  });
});
