import { MeDashboardService } from './me-dashboard.service.js';

const TODAY = new Date('2026-11-26T03:00:00.000Z');

function setup(contracts: unknown[] = [], invoices: { total: number; invoiceStatus: string }[] = []) {
  const prisma = {
    creators: { findUnique: vi.fn().mockResolvedValue({ contracts }) },
  };
  const invoicesService = { forCreator: vi.fn().mockResolvedValue(invoices) };
  return {
    prisma,
    invoicesService,
    service: new MeDashboardService(prisma as never, invoicesService as never),
  };
}

const contract = {
  id: 'contract-1',
  start_date: new Date('2026-01-01T00:00:00.000Z'),
  end_date: new Date('2026-12-31T00:00:00.000Z'),
  content_quota: 5,
  ended_at: null,
  original_end_date: null,
  contents: [
    {
      deadline: new Date('2026-11-05T00:00:00.000Z'),
      video_submitted_at: new Date('2026-11-04T00:00:00.000Z'),
      type: 'evergreen',
      status: 'link_submitted',
      _count: { submissions: 1 },
    },
    {
      deadline: new Date('2026-12-05T00:00:00.000Z'),
      video_submitted_at: null,
      type: 'specific',
      status: 'scheduled',
      _count: { submissions: 0 },
    },
  ],
};

describe('MeDashboardService', () => {
  it('reads the current contract and the running invoice for one creator', async () => {
    const { prisma, invoicesService, service } = setup(
      [contract],
      [{ total: 4_500_000, invoiceStatus: 'accruing' }],
    );

    const result = await service.dashboard('ana', TODAY);

    expect(prisma.creators.findUnique).toHaveBeenCalledWith({
      where: { id: 'ana' },
      select: expect.objectContaining({ contracts: expect.anything() }),
    });
    expect(invoicesService.forCreator).toHaveBeenCalledWith('ana', TODAY);
    expect(result).toEqual({
      period: { startDate: '2026-01-01', endDate: '2026-12-31' },
      sent: 1,
      quota: 6,
      earningsEstimate: 4_500_000,
      paymentsHref: '/creator/payments',
    });
  });

  it('shows no period and no earnings when the creator row has no contracts', async () => {
    const { prisma, service } = setup([], []);
    prisma.creators.findUnique.mockResolvedValue(null);

    expect(await service.dashboard('ana', TODAY)).toEqual({
      period: null,
      sent: 0,
      quota: 0,
      earningsEstimate: 0,
      paymentsHref: '/creator/payments',
    });
  });

  it('shows no period and no earnings to a creator without a contract', async () => {
    const { service } = setup([], []);

    expect(await service.dashboard('ana', TODAY)).toEqual({
      period: null,
      sent: 0,
      quota: 0,
      earningsEstimate: 0,
      paymentsHref: '/creator/payments',
    });
  });

  it('reads the quota of the current contract when more than one exists', async () => {
    const older = {
      ...contract,
      id: 'old',
      end_date: new Date('2025-12-31T00:00:00.000Z'),
      contents: [],
    };
    const { service } = setup([older, contract], []);

    expect((await service.dashboard('ana', TODAY)).quota).toBe(6);
  });

  it('never shows a finalized amount as the running estimate', async () => {
    const { service } = setup(
      [contract],
      [{ total: 9_000_000, invoiceStatus: 'paid' }],
    );

    expect((await service.dashboard('ana', TODAY)).earningsEstimate).toBe(0);
  });
});
