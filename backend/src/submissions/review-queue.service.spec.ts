import {
  ReviewQueueService,
  type QueueRow,
  type ReviewQueueClient,
} from './review-queue.service.js';

const TODAY = new Date('2026-10-10T15:30:00.000Z');
const PAGE = { page: 1, pageSize: 10 };

let seq = 0;

function row(overrides: {
  status?: 'draft_review' | 'draft_revised';
  type?: 'evergreen' | 'specific';
  name?: string;
  deadline?: string;
  creator?: {
    first_name: string;
    middle_name: string | null;
    last_name: string | null;
  };
  submissions?: { id: string; created_at: Date }[];
}): QueueRow {
  seq += 1;
  return {
    id: `content-${seq}`,
    name: overrides.name ?? `Konten ${seq}`,
    type: overrides.type ?? 'specific',
    deadline: new Date(`${overrides.deadline ?? '2026-10-20'}T00:00:00.000Z`),
    status: overrides.status ?? 'draft_review',
    contracts: {
      creators: overrides.creator ?? {
        first_name: 'Dina',
        middle_name: null,
        last_name: 'Putri',
      },
    },
    submissions: overrides.submissions ?? [
      { id: `sub-${seq}`, created_at: new Date('2026-10-01T08:00:00.000Z') },
    ],
  };
}

function stub(rows: QueueRow[]) {
  const client = {
    contents: { findMany: vi.fn().mockResolvedValue(rows) },
  } satisfies ReviewQueueClient;
  return { client, service: new ReviewQueueService(client) };
}

describe('ReviewQueueService.list', () => {
  beforeEach(() => {
    seq = 0;
  });

  it('reads only drafts waiting for a decision, with their latest hand-in ordered like approve', async () => {
    const { client, service } = stub([]);

    await service.list(PAGE, TODAY, {});

    expect(client.contents.findMany).toHaveBeenCalledWith({
      where: {
        status: { in: ['draft_review', 'draft_revised'] },
        submissions: { some: {} },
      },
      select: {
        id: true,
        name: true,
        type: true,
        deadline: true,
        status: true,
        contracts: {
          select: {
            creators: {
              select: { first_name: true, middle_name: true, last_name: true },
            },
          },
        },
        submissions: {
          orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
          take: 1,
          select: { id: true, created_at: true },
        },
      },
    });
  });

  it('answers each row with the latest submission id, the full creator name and the deadline as a calendar day', async () => {
    const { service } = stub([
      row({
        status: 'draft_revised',
        type: 'evergreen',
        name: 'Evg_1_Dina_20102026',
        deadline: '2026-10-20',
        creator: { first_name: 'Dina', middle_name: 'Ayu', last_name: 'Putri' },
        submissions: [
          { id: 'latest', created_at: new Date('2026-10-05T08:00:00.000Z') },
        ],
      }),
    ]);

    const result = await service.list(PAGE, TODAY, {});

    expect(result).toEqual({
      items: [
        {
          submissionId: 'latest',
          creatorName: 'Dina Ayu Putri',
          contentName: 'Evg_1_Dina_20102026',
          type: 'evergreen',
          deadline: '2026-10-20',
          status: 'draft_revised',
        },
      ],
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
    });
  });

  it('leaves missing name parts out of the creator name', async () => {
    const { service } = stub([
      row({
        creator: { first_name: 'Budi', middle_name: null, last_name: null },
      }),
    ]);

    const { items } = await service.list(PAGE, TODAY, {});

    expect(items[0].creatorName).toBe('Budi');
  });

  it('skips a content that somehow has no hand-in instead of failing the whole page', async () => {
    const { service } = stub([
      row({ submissions: [] }),
      row({ name: 'Ada draft' }),
    ]);

    const result = await service.list(PAGE, TODAY, {});

    expect(result.items.map((item) => item.contentName)).toEqual(['Ada draft']);
    expect(result.total).toBe(1);
  });

  it('puts resubmitted drafts first, then the nearest deadline', async () => {
    const { service } = stub([
      row({ name: 'review late', deadline: '2026-10-25' }),
      row({ name: 'review soon', deadline: '2026-10-12' }),
      row({ name: 'resubmit late', status: 'draft_revised', deadline: '2026-11-30' }),
    ]);

    const { items } = await service.list(PAGE, TODAY, {});

    expect(items.map((item) => item.contentName)).toEqual([
      'resubmit late',
      'review soon',
      'review late',
    ]);
  });

  describe('filters', () => {
    it('narrows the statuses read when one queue status is asked for', async () => {
      const { client, service } = stub([]);

      await service.list(PAGE, TODAY, { status: 'draft_revised' });

      expect(client.contents.findMany.mock.calls[0][0].where.status).toEqual({
        in: ['draft_revised'],
      });
    });

    it('filters by content type in the query', async () => {
      const { client, service } = stub([]);

      await service.list(PAGE, TODAY, { type: 'evergreen' });

      expect(client.contents.findMany.mock.calls[0][0].where.type).toBe(
        'evergreen',
      );
    });

    it('treats overdue as a deadline before today, counted in whole days', async () => {
      const { client, service } = stub([]);

      await service.list(PAGE, TODAY, { overdue: true });

      expect(client.contents.findMany.mock.calls[0][0].where.deadline).toEqual({
        lt: new Date('2026-10-10T00:00:00.000Z'),
      });
    });

    it('adds no type or deadline condition when those filters are off', async () => {
      const { client, service } = stub([]);

      await service.list(PAGE, TODAY, {});

      const { where } = client.contents.findMany.mock.calls[0][0];
      expect(where).not.toHaveProperty('type');
      expect(where).not.toHaveProperty('deadline');
    });

    it.each([
      ['the creator name', 'dina ayu'],
      ['the content name', 'UNBOXING'],
    ])('matches the search against %s, ignoring case', async (_, q) => {
      const { service } = stub([
        row({
          name: 'Unboxing Serum',
          creator: { first_name: 'Dina', middle_name: 'Ayu', last_name: 'Putri' },
        }),
        row({
          name: 'Tutorial',
          creator: { first_name: 'Budi', middle_name: null, last_name: 'Santoso' },
        }),
      ]);

      const result = await service.list(PAGE, TODAY, { q });

      expect(result.items.map((item) => item.contentName)).toEqual([
        'Unboxing Serum',
      ]);
      expect(result.total).toBe(1);
    });

    it('answers an empty first page when nothing matches the search', async () => {
      const { service } = stub([row({})]);

      const result = await service.list(PAGE, TODAY, { q: 'tidak ada' });

      expect(result).toEqual({
        items: [],
        page: 1,
        pageSize: 10,
        total: 0,
        totalPages: 1,
      });
    });
  });

  describe('paging', () => {
    function twelveDrafts(): QueueRow[] {
      return Array.from({ length: 12 }, (_, i) =>
        row({
          name: `Draft ${String(i + 1).padStart(2, '0')}`,
          deadline: `2026-10-${String(11 + i).padStart(2, '0')}`,
        }),
      );
    }

    it('serves ten rows on the first page and counts every page', async () => {
      const { service } = stub(twelveDrafts());

      const result = await service.list(PAGE, TODAY, {});

      expect(result.items).toHaveLength(10);
      expect(result.items[0].contentName).toBe('Draft 01');
      expect(result.total).toBe(12);
      expect(result.totalPages).toBe(2);
    });

    it('serves the remainder on the last page', async () => {
      const { service } = stub(twelveDrafts());

      const result = await service.list({ page: 2, pageSize: 10 }, TODAY, {});

      expect(result.items.map((item) => item.contentName)).toEqual([
        'Draft 11',
        'Draft 12',
      ]);
      expect(result.page).toBe(2);
    });

    it('answers an empty page past the end instead of an error', async () => {
      const { service } = stub(twelveDrafts());

      const result = await service.list({ page: 3, pageSize: 10 }, TODAY, {});

      expect(result.items).toEqual([]);
      expect(result.total).toBe(12);
      expect(result.totalPages).toBe(2);
    });

    it('fills exactly one page when the queue is a multiple of the page size', async () => {
      const { service } = stub(twelveDrafts().slice(0, 10));

      const result = await service.list(PAGE, TODAY, {});

      expect(result.totalPages).toBe(1);
    });
  });
});
