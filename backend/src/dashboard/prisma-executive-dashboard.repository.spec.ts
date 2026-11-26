import { PrismaExecutiveDashboardRepository } from './prisma-executive-dashboard.repository.js';

function stub() {
  const invoices = { findMany: vi.fn().mockResolvedValue([]) };
  const content_links = { findMany: vi.fn().mockResolvedValue([]) };
  const contents = { findMany: vi.fn().mockResolvedValue([]) };
  const contracts = { findMany: vi.fn().mockResolvedValue([]) };
  return {
    prisma: { invoices, content_links, contents, contracts },
    invoices,
    content_links,
    contents,
    contracts,
  };
}

const FROM = '2026-06-01';
const TO = '2026-11-30';

const component = (amount: number) => ({ amount, status: 'calculated', lines: [] });

const snapshot = {
  fixedRate: component(5_000_000),
  additionalContent: component(2_000_000),
  performanceBonus: component(1_000_000),
  penalty: component(-500_000),
  adjustments: [],
  rawTotal: 8_000_000,
  total: 7_500_000,
  floored: false,
  finalizedAt: '2026-10-20T00:00:00.000Z',
};

describe('the executive dashboard repository', () => {
  it('reads only finalized, non-cancelled invoices inside the finalized range', async () => {
    const { prisma, invoices } = stub();
    // The where above is what excludes cancelled and out-of-range invoices; a real DB returns
    // only rows that match it, so the stub returns just the paid one.
    invoices.findMany.mockResolvedValue([
      { finalized_at: new Date('2026-10-20T00:00:00.000Z'), status: 'paid', snapshot, contracts: { creator_id: 'ana' } },
    ]);
    const repo = new PrismaExecutiveDashboardRepository(prisma as never);

    const rows = await repo.finalizedInRange(FROM, TO);

    expect(invoices.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          finalized_at: { gte: new Date('2026-06-01T00:00:00.000Z'), lte: new Date('2026-11-30T23:59:59.999Z') },
          status: { in: ['finalized', 'creator_acked', 'payment_uploaded', 'paid'] },
        },
      }),
    );
    expect(rows).toEqual([
      {
        creatorId: 'ana',
        finalizedAt: '2026-10-20',
        status: 'paid',
        fixedRate: 5_000_000,
        additionalContent: 2_000_000,
        performanceBonus: 1_000_000,
        total: 7_500_000,
      },
    ]);
  });

  it('skips an invoice with no readable snapshot, rather than recalculating it live', async () => {
    const { prisma, invoices } = stub();
    invoices.findMany.mockResolvedValue([
      { finalized_at: new Date('2026-10-20T00:00:00.000Z'), status: 'finalized', snapshot: { nope: true }, contracts: { creator_id: 'ana' } },
      { finalized_at: null, status: 'finalized', snapshot, contracts: { creator_id: 'ana' } },
    ]);
    const repo = new PrismaExecutiveDashboardRepository(prisma as never);

    expect(await repo.finalizedInRange(FROM, TO)).toEqual([]);
  });

  it('reads links handed in inside the range with their stored numbers and creator', async () => {
    const { prisma, content_links } = stub();
    content_links.findMany.mockResolvedValue([
      {
        submitted_at: new Date('2026-10-10T00:00:00.000Z'),
        platform: 'tiktok',
        views: 400,
        likes: 20,
        comments: 5,
        shares: 3,
        data_state: 'synced',
        contents: { contracts: { creator_id: 'budi' } },
      },
    ]);
    const repo = new PrismaExecutiveDashboardRepository(prisma as never);

    const rows = await repo.linksSentInRange(FROM, TO);

    expect(content_links.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          submitted_at: {
            gte: new Date('2026-06-01T00:00:00.000Z'),
            lte: new Date('2026-11-30T23:59:59.999Z'),
          },
        },
      }),
    );
    expect(rows).toEqual([
      {
        creatorId: 'budi',
        submittedAt: '2026-10-10',
        platform: 'tiktok',
        views: 400,
        likes: 20,
        comments: 5,
        shares: 3,
        dataState: 'synced',
      },
    ]);
  });

  it('reads content due in the range, marking proposals as not a commitment', async () => {
    const { prisma, contents } = stub();
    contents.findMany.mockResolvedValue([
      {
        deadline: new Date('2026-11-05T00:00:00.000Z'),
        video_submitted_at: new Date('2026-11-04T00:00:00.000Z'),
        status: 'pending',
        contracts: { creator_id: 'ana' },
      },
      {
        deadline: new Date('2026-11-06T00:00:00.000Z'),
        video_submitted_at: null,
        status: 'scheduled',
        contracts: { creator_id: 'budi' },
      },
    ]);
    const repo = new PrismaExecutiveDashboardRepository(prisma as never);

    const rows = await repo.contentsDueInRange(FROM, TO);

    expect(rows).toEqual([
      { creatorId: 'ana', deadline: '2026-11-05', videoSubmittedAt: '2026-11-04', isProposal: true },
      { creatorId: 'budi', deadline: '2026-11-06', videoSubmittedAt: null, isProposal: false },
    ]);
  });

  it('reads creators whose contract period overlaps the range', async () => {
    const { prisma, contracts } = stub();
    contracts.findMany.mockResolvedValue([
      {
        start_date: new Date('2026-01-01T00:00:00.000Z'),
        end_date: new Date('2026-12-31T00:00:00.000Z'),
        content_quota: 10,
        creators: { id: 'ana', first_name: 'Ana', middle_name: null, last_name: 'Pratama' },
      },
    ]);
    const repo = new PrismaExecutiveDashboardRepository(prisma as never);

    const rows = await repo.creatorsWithContracts(FROM, TO);

    expect(contracts.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          start_date: { lte: new Date('2026-11-30T00:00:00.000Z') },
          end_date: { gte: new Date('2026-06-01T00:00:00.000Z') },
        },
      }),
    );
    expect(rows).toEqual([
      { creatorId: 'ana', name: 'Ana Pratama', quota: 10, startDate: '2026-01-01', endDate: '2026-12-31' },
    ]);
  });
});
