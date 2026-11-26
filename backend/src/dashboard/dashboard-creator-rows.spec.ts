import { creatorRows, type CreatorInput } from './dashboard-creator-rows.js';

const TODAY = new Date('2026-11-26T03:00:00.000Z');

const ana: CreatorInput = {
  creatorId: 'ana',
  name: 'Ana',
  contract: { quota: 5, startDate: '2026-01-01', endDate: '2026-12-31' },
};
const budi: CreatorInput = {
  creatorId: 'budi',
  name: 'Budi',
  contract: { quota: 4, startDate: '2026-01-01', endDate: '2026-12-31' },
};

describe("the executive dashboard's creator rows", () => {
  it('lists only creators with a contract in the range', () => {
    expect(
      creatorRows(
        [ana, { ...budi, creatorId: 'none', contract: null }],
        [],
        [],
        [],
        'views',
        'desc',
        TODAY,
      ).map((row) => row.creatorId),
    ).toEqual(['ana']);
  });

  it('reads spending, sent against quota, on-time rate, views and cost per 1k', () => {
    const [row] = creatorRows(
      [ana],
      [{ creatorId: 'ana', spending: 1_000_000 }],
      [
        { creatorId: 'ana', views: 1_000, dataState: 'synced', platform: 'instagram' },
        { creatorId: 'ana', views: 3_000, dataState: 'manual', platform: 'tiktok' },
      ],
      [
        { creatorId: 'ana', deadline: '2026-11-05', videoSubmittedAt: '2026-11-04', isProposal: false },
        { creatorId: 'ana', deadline: '2026-11-10', videoSubmittedAt: '2026-11-12', isProposal: false },
        { creatorId: 'ana', deadline: '2026-11-20', videoSubmittedAt: null, isProposal: false },
      ],
      'views',
      'desc',
      TODAY,
    );

    expect(row).toEqual({
      creatorId: 'ana',
      name: 'Ana',
      spending: 1_000_000,
      sent: 2,
      quota: 5,
      onTimeRate: 50,
      views: 4_000,
      costPer1000Views: 250_000,
    });
  });

  it('shows "—" for rates when there are no views or no resolved content', () => {
    const [row] = creatorRows([ana], [], [], [], 'views', 'desc', TODAY);
    expect(row.onTimeRate).toBeNull();
    expect(row.costPer1000Views).toBeNull();
    expect(row.views).toBe(0);
  });

  it('sorts by every column and defaults to views, high to low', () => {
    const rows = [
      { creatorId: 'ana', spending: 100, views: 10, sent: 1 },
      { creatorId: 'budi', spending: 200, views: 30, sent: 3 },
    ] as const;
    const spend = (id: string) => rows.filter((r) => r.creatorId === id).map((r) => ({ creatorId: id, spending: r.spending }));
    const view = (id: string) => rows.filter((r) => r.creatorId === id).map((r) => ({ creatorId: id, views: r.views, dataState: 'synced', platform: 'instagram' }));
    const inputs = [ana, budi];
    const links = [...view('ana'), ...view('budi')];
    const invoices = [...spend('ana'), ...spend('budi')];

    expect(creatorRows(inputs, invoices, links, [], 'views', 'desc', TODAY).map((r) => r.creatorId)).toEqual(['budi', 'ana']);
    expect(creatorRows(inputs, invoices, links, [], 'views', 'asc', TODAY).map((r) => r.creatorId)).toEqual(['ana', 'budi']);
    expect(creatorRows(inputs, invoices, links, [], 'spending', 'desc', TODAY).map((r) => r.creatorId)).toEqual(['budi', 'ana']);
    const sent = [
      { creatorId: 'ana', deadline: '2026-11-05', videoSubmittedAt: '2026-11-04', isProposal: false },
      { creatorId: 'budi', deadline: '2026-11-05', videoSubmittedAt: '2026-11-04', isProposal: false },
      { creatorId: 'budi', deadline: '2026-11-10', videoSubmittedAt: '2026-11-09', isProposal: false },
      { creatorId: 'budi', deadline: '2026-11-15', videoSubmittedAt: '2026-11-14', isProposal: false },
    ];
    expect(creatorRows(inputs, invoices, links, sent, 'sent', 'desc', TODAY).map((r) => r.creatorId)).toEqual(['budi', 'ana']);
    expect(creatorRows(inputs, invoices, links, [], 'name', 'asc', TODAY).map((r) => r.creatorId)).toEqual(['ana', 'budi']);
    expect(creatorRows(inputs, invoices, links, [], 'onTimeRate', 'desc', TODAY).map((r) => r.creatorId)).toEqual(['ana', 'budi']);
    expect(creatorRows(inputs, invoices, links, [], 'costPer1000Views', 'desc', TODAY).map((r) => r.creatorId)).toEqual(['ana', 'budi']);
  });

  it('breaks equal values by name so the order never depends on the database', () => {
    const inputs = [budi, ana];
    const rows = creatorRows(inputs, [], [], [], 'views', 'desc', TODAY);
    expect(rows.map((row) => row.name)).toEqual(['Ana', 'Budi']);
  });
});
