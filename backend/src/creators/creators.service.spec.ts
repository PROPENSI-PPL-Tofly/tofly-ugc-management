import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreatorsService, type CreatorRow } from './creators.service.js';

const TODAY = new Date('2026-09-18T00:00:00Z');

function day(offset: number): Date {
  return new Date(Date.UTC(2026, 8, 18 + offset));
}

function row(overrides: Partial<CreatorRow> = {}): CreatorRow {
  return {
    id: 'creator-1',
    first_name: 'Rangga',
    middle_name: null,
    last_name: 'Pratama',
    access_revoke_date: null,
    users: { email: 'rangga@example.com' },
    social_accounts: [
      { platform: 'instagram', username: 'rangga.creates' },
      { platform: 'tiktok', username: 'ranggacreates' },
    ],
    contracts: [
      {
        id: 'contract-1',
        start_date: day(-100),
        end_date: day(80),
        content_quota: 6,
        contents: [
          {
            deadline: day(-30),
            video_submitted_at: day(-31),
            is_proposal: false,
            _count: { submissions: 1 },
          },
          {
            deadline: day(-10),
            video_submitted_at: day(-8),
            is_proposal: false,
            _count: { submissions: 2 },
          },
          {
            deadline: day(20),
            video_submitted_at: null,
            is_proposal: false,
            _count: { submissions: 0 },
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe('CreatorsService', () => {
  let service: CreatorsService;
  const prisma = {
    creators: { findMany: vi.fn(), count: vi.fn() },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        CreatorsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(CreatorsService);
  });

  it('asks the database for one page, ordered by name', async () => {
    prisma.creators.findMany.mockResolvedValue([]);
    prisma.creators.count.mockResolvedValue(0);

    await service.list({ page: 3, pageSize: 10 }, TODAY);

    expect(prisma.creators.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 10,
        orderBy: [{ first_name: 'asc' }, { last_name: 'asc' }, { id: 'asc' }],
      }),
    );
  });

  it('maps a database row to the summary the table renders', async () => {
    prisma.creators.findMany.mockResolvedValue([row()]);
    prisma.creators.count.mockResolvedValue(1);

    const result = await service.list({ page: 1, pageSize: 10 }, TODAY);

    expect(result).toEqual({
      items: [
        {
          id: 'creator-1',
          name: 'Rangga Pratama',
          email: 'rangga@example.com',
          socials: { instagram: 'rangga.creates', tiktok: 'ranggacreates' },
          accessRevokeDate: null,
          contract: {
            status: 'active',
            startDate: '2026-06-10',
            endDate: '2026-12-07',
            daysRemaining: 80,
            periodNumber: 1,
            contentQuota: 6,
          },
          progress: { submitted: 2, total: 3, percent: 67 },
          performance: {
            onTimeRate: 50,
            avgRevisions: 0.5,
            productivity: 'watch',
            productivityLabel: 'Perlu Perhatian',
          },
        },
      ],
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
    });
  });

  it('joins the middle name into the display name', async () => {
    prisma.creators.findMany.mockResolvedValue([
      row({ middle_name: 'Nur', last_name: 'Aini' }),
    ]);
    prisma.creators.count.mockResolvedValue(1);

    const { items } = await service.list({ page: 1, pageSize: 10 }, TODAY);

    expect(items[0].name).toBe('Rangga Nur Aini');
  });

  it('copes with a creator who only has a first name', async () => {
    prisma.creators.findMany.mockResolvedValue([row({ last_name: null })]);
    prisma.creators.count.mockResolvedValue(1);

    const { items } = await service.list({ page: 1, pageSize: 10 }, TODAY);

    expect(items[0].name).toBe('Rangga');
  });

  it('describes a creator without any contract', async () => {
    prisma.creators.findMany.mockResolvedValue([
      row({ contracts: [], social_accounts: [] }),
    ]);
    prisma.creators.count.mockResolvedValue(1);

    const { items } = await service.list({ page: 1, pageSize: 10 }, TODAY);

    expect(items[0]).toMatchObject({
      socials: {},
      contract: {
        status: 'none',
        startDate: null,
        endDate: null,
        daysRemaining: null,
        periodNumber: 0,
        contentQuota: 0,
      },
      progress: { submitted: 0, total: 0, percent: 0 },
      performance: { onTimeRate: null, productivityLabel: 'Belum Ada Data' },
    });
  });

  it("numbers the period from the creator's contract history", async () => {
    prisma.creators.findMany.mockResolvedValue([
      row({
        access_revoke_date: day(-14),
        contracts: [
          {
            id: 'second',
            start_date: day(-30),
            end_date: day(150),
            content_quota: 4,
            contents: [],
          },
          {
            id: 'first',
            start_date: day(-400),
            end_date: day(-40),
            content_quota: 6,
            contents: [],
          },
        ],
      }),
    ]);
    prisma.creators.count.mockResolvedValue(1);

    const { items } = await service.list({ page: 1, pageSize: 10 }, TODAY);

    expect(items[0].accessRevokeDate).toBe('2026-09-04');
    expect(items[0].contract).toMatchObject({
      status: 'active',
      periodNumber: 2,
      contentQuota: 4,
    });
  });

  it('reports the page count from the total, not from the rows returned', async () => {
    prisma.creators.findMany.mockResolvedValue([]);
    prisma.creators.count.mockResolvedValue(23);

    const result = await service.list({ page: 5, pageSize: 10 }, TODAY);

    expect(result).toMatchObject({
      items: [],
      page: 5,
      total: 23,
      totalPages: 3,
    });
  });

  it('has at least one page even when the roster is empty', async () => {
    prisma.creators.findMany.mockResolvedValue([]);
    prisma.creators.count.mockResolvedValue(0);

    const result = await service.list({ page: 1, pageSize: 10 }, TODAY);

    expect(result.totalPages).toBe(1);
  });

  it('searches the whole roster by name or email when q is given', async () => {
    prisma.creators.findMany.mockResolvedValue([
      row({ id: 'creator-1', first_name: 'Nadia', last_name: 'Putri', users: { email: 'nadia@example.com' } }),
      row({ id: 'creator-2', first_name: 'Budi', last_name: 'Santoso', users: { email: 'budi@example.com' } }),
    ]);
    prisma.creators.count.mockResolvedValue(2);

    const result = await service.list({ page: 1, pageSize: 10 }, TODAY, { q: 'nadia' });

    expect(result.items.map((item) => item.id)).toEqual(['creator-1']);
    expect(result.total).toBe(1);
  });

  it('filters the roster by contract status', async () => {
    prisma.creators.findMany.mockResolvedValue([
      row({ id: 'creator-1' }),
      row({
        id: 'creator-2',
        contracts: [{ id: 'c2', start_date: day(-400), end_date: day(-40), content_quota: 4, contents: [] }],
      }),
    ]);
    prisma.creators.count.mockResolvedValue(2);

    const result = await service.list({ page: 1, pageSize: 10 }, TODAY, { contractStatus: 'expired' });

    expect(result.items.map((item) => item.id)).toEqual(['creator-2']);
    expect(result.total).toBe(1);
  });

  it('filters the roster by productivity band', async () => {
    prisma.creators.findMany.mockResolvedValue([
      row({ id: 'creator-1' }),
      row({
        id: 'creator-2',
        contracts: [
          {
            id: 'c2',
            start_date: day(-100),
            end_date: day(80),
            content_quota: 1,
            contents: [{ deadline: day(-30), video_submitted_at: null, is_proposal: false, _count: { submissions: 0 } }],
          },
        ],
      }),
    ]);
    prisma.creators.count.mockResolvedValue(2);

    const result = await service.list({ page: 1, pageSize: 10 }, TODAY, { productivity: 'risk' });

    expect(result.items.map((item) => item.id)).toEqual(['creator-2']);
    expect(result.total).toBe(1);
  });

  it('does not ask the database to skip/take when a filter is active', async () => {
    prisma.creators.findMany.mockResolvedValue([]);
    prisma.creators.count.mockResolvedValue(0);

    await service.list({ page: 2, pageSize: 10 }, TODAY, { q: 'anything' });

    expect(prisma.creators.findMany).toHaveBeenCalledWith({
      select: expect.anything(),
      orderBy: expect.anything(),
    });
    expect(prisma.creators.count).not.toHaveBeenCalled();
  });

  it('uses the current date when none is given', async () => {
    prisma.creators.findMany.mockResolvedValue([
      row({
        contracts: [
          {
            id: 'c',
            start_date: day(-1),
            end_date: new Date('2999-01-01T00:00:00Z'),
            content_quota: 1,
            contents: [],
          },
        ],
      }),
    ]);
    prisma.creators.count.mockResolvedValue(1);

    const { items } = await service.list({ page: 1, pageSize: 10 });

    expect(items[0].contract.status).toBe('active');
  });
});
