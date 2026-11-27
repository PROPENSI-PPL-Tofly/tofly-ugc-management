import { DashboardService } from './dashboard.service.js';

const TODAY = new Date('2026-11-26T03:00:00.000Z');

const invoice = (total: number, month: string, status = 'paid') => ({
  creatorId: 'ana',
  finalizedAt: `${month}-20`,
  status,
  fixedRate: total,
  additionalContent: 0,
  performanceBonus: 0,
  total,
});

const link = (month: string, views: number | null, dataState = 'synced') => ({
  creatorId: 'ana',
  submittedAt: `${month}-10`,
  platform: 'instagram' as const,
  views,
  likes: 10,
  comments: 5,
  shares: 5,
  dataState,
});

const content = (month: string, submitted: string | null = null) => ({
  creatorId: 'ana',
  deadline: `${month}-05`,
  videoSubmittedAt: submitted,
  isProposal: false,
});

const creator = {
  creatorId: 'ana',
  name: 'Ana',
  quota: 5,
  startDate: '2026-01-01',
  endDate: '2026-12-31',
};

function setup(current: {
  invoices: ReturnType<typeof invoice>[];
  links: ReturnType<typeof link>[];
  contents: ReturnType<typeof content>[];
  creators?: typeof creator[];
}) {
  const repo = {
    finalizedInRange: vi.fn().mockResolvedValue(current.invoices),
    linksSentInRange: vi.fn().mockResolvedValue(current.links),
    contentsDueInRange: vi.fn().mockResolvedValue(current.contents),
    creatorsWithContracts: vi.fn().mockResolvedValue(current.creators ?? [creator]),
  };
  return { repo, service: new DashboardService(repo as never) };
}

describe('DashboardService', () => {
  it('reads both ranges and compares every KPI against the previous one', async () => {
    const { repo, service } = setup({
      invoices: [invoice(12_000_000, '2026-11')],
      links: [link('2026-11', 4_000)],
      contents: [content('2026-11', '2026-11-04')],
    });
    const previous = {
      invoices: [invoice(10_000_000, '2026-05')],
      links: [link('2026-05', 2_000)],
      contents: [content('2026-05', '2026-05-06')],
    };
    repo.finalizedInRange.mockImplementation(async (from: string) =>
      from === '2025-12-01' ? previous.invoices : [invoice(12_000_000, '2026-11')],
    );
    repo.linksSentInRange.mockImplementation(async (from: string) =>
      from === '2025-12-01' ? previous.links : [link('2026-11', 4_000)],
    );
    repo.contentsDueInRange.mockImplementation(async (from: string) =>
      from === '2025-12-01' ? previous.contents : [content('2026-11', '2026-11-04')],
    );

    const result = await service.executive(TODAY, 6);

    expect(repo.finalizedInRange).toHaveBeenCalledWith('2026-06-01', '2026-11-30');
    expect(repo.finalizedInRange).toHaveBeenCalledWith('2025-12-01', '2026-05-31');
    expect(result.range).toEqual({
      from: '2026-06-01',
      to: '2026-11-30',
      previousFrom: '2025-12-01',
      previousTo: '2026-05-31',
    });
    expect(result.kpis.find((kpi) => kpi.key === 'totalSpending')).toMatchObject({
      value: 12_000_000,
      change: 0.2,
      direction: 'up',
      good: false,
    });
    expect(result.kpis.find((kpi) => kpi.key === 'totalViews')).toMatchObject({
      value: 4_000,
      change: 1,
      direction: 'up',
      good: true,
    });
  });

  it('assembles all three charts and the sorted creator rows from the same reads', async () => {
    const { service } = setup({
      invoices: [invoice(2_000_000, '2026-11')],
      links: [link('2026-11', 100)],
      contents: [content('2026-11', '2026-11-04')],
    });

    const result = await service.executive(TODAY, 3);

    expect(result.charts.map((chart) => chart.key)).toEqual(['spending', 'views', 'timeliness']);
    expect(result.charts[0].months.at(-1)!.total).toBe(2_000_000);
    expect(result.charts[1].months.at(-1)!.total).toBe(100);
    expect(result.charts[2].months.at(-1)!.total).toBe(1);
    expect(result.creators).toEqual([
      {
        creatorId: 'ana',
        name: 'Ana',
        spending: 2_000_000,
        sent: 1,
        quota: 5,
        onTimeRate: 100,
        views: 100,
        costPer1000Views: 20_000_000,
      },
    ]);
  });

  it('counts links whose numbers never arrived, for the "belum ada data" note', async () => {
    const { service } = setup({
      invoices: [],
      links: [link('2026-11', null, 'waiting'), link('2026-11', 50, 'manual')],
      contents: [],
    });

    const result = await service.executive(TODAY, 6);

    expect(result.missingViewLinks).toBe(1);
    expect(result.kpis.find((kpi) => kpi.key === 'totalViews')?.value).toBe(50);
  });

  it('treats missing link metrics and unpaid statuses as zero and unpaid spending', async () => {
    const { service, repo } = setup({
      invoices: [invoice(100, '2026-11', 'finalized')],
      links: [{ ...link('2026-11', 50), likes: null, comments: null, shares: null }],
      contents: [content('2026-11')],
    });
    // Previous range has the same rows, so only the values matter here.
    const result = await service.executive(TODAY, 6);
    const byKey = Object.fromEntries(result.kpis.map((kpi) => [kpi.key, kpi]));

    expect(byKey.unpaid.value).toBe(100);
    expect(byKey.engagementRate.value).toBe(0);
    expect(byKey.onTimeRate.value).toBe(0);
    expect(repo.contentsDueInRange).toHaveBeenCalledTimes(2);
  });

  // Prototype formula: sent by the deadline ÷ content that has fallen due. Content whose deadline
  // is still ahead this month is not due yet, so it neither helps nor hurts the rate.
  it('judges the on-time rate only on content that has fallen due', async () => {
    const { service } = setup({
      invoices: [],
      links: [],
      contents: [
        content('2026-11', '2026-11-04'),
        content('2026-10'),
        { ...content('2026-11'), deadline: '2026-11-28' },
      ],
    });

    const result = await service.executive(TODAY, 6);

    expect(result.kpis.find((kpi) => kpi.key === 'onTimeRate')?.value).toBe(50);
  });

  it('shows empty dashboards as "—" rather than errors', async () => {
    const { service } = setup({ invoices: [], links: [], contents: [], creators: [] });

    const result = await service.executive(TODAY, 6);

    expect(result.creators).toEqual([]);
    // Every month of the range is still a bar, at zero, so the charts keep their axis (AC 4).
    for (const chart of result.charts) {
      expect(chart.months.map((month) => month.month)).toEqual([
        '2026-06',
        '2026-07',
        '2026-08',
        '2026-09',
        '2026-10',
        '2026-11',
      ]);
      expect(chart.months.every((month) => month.total === 0)).toBe(true);
    }
    expect(result.kpis.every((kpi) => kpi.value === null || kpi.value === 0)).toBe(true);
  });
});
