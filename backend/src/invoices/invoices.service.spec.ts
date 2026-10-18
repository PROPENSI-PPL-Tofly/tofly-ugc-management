import { Prisma } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import type { InvoiceCreatorRow } from './invoice-rows.js';
import { FORMULA, TODAY, day } from './invoice-test-data.js';
import { InvoicesService } from './invoices.service.js';
import { RATE_FORMULA_SOURCE } from './rate-formula.js';

function row(overrides: Partial<InvoiceCreatorRow> = {}): InvoiceCreatorRow {
  return {
    id: 'creator-1',
    first_name: 'Rangga',
    middle_name: null,
    last_name: 'Pratama',
    access_revoke_date: null,
    contracts: [
      {
        id: 'contract-1',
        start_date: day(-60),
        end_date: day(60),
        content_quota: 11,
        fixed_rate: new Prisma.Decimal('5500000'),
      },
    ],
    ...overrides,
  };
}

describe('InvoicesService', () => {
  let service: InvoicesService;

  const prisma = {
    creators: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    contents: {
      findMany: vi.fn(),
    },
    invoices: {
      findMany: vi.fn(),
    },
  };
  const formulas = { current: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    formulas.current.mockResolvedValue(FORMULA);
    prisma.contents.findMany.mockResolvedValue([]);
    prisma.invoices.findMany.mockResolvedValue([]);

    const module = await Test.createTestingModule({
      providers: [
        InvoicesService,
        { provide: PrismaService, useValue: prisma },
        { provide: RATE_FORMULA_SOURCE, useValue: formulas },
      ],
    }).compile();

    service = module.get(InvoicesService);
  });

  it('asks for one page of creators that have a contract, ordered by name', async () => {
    // Arrange
    prisma.creators.findMany.mockResolvedValue([]);
    prisma.creators.count.mockResolvedValue(30);

    // Act
    await service.list({ page: 3, pageSize: 10 }, TODAY);

    // Assert
    expect(prisma.creators.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { contracts: { some: {} } },
        skip: 20,
        take: 10,
        orderBy: [{ first_name: 'asc' }, { last_name: 'asc' }, { id: 'asc' }],
      }),
    );
    expect(prisma.creators.count).toHaveBeenCalledWith({
      where: { contracts: { some: {} } },
    });
  });

  it('calculates each creator with the current formula from the source', async () => {
    prisma.creators.findMany.mockResolvedValue([row()]);
    prisma.creators.count.mockResolvedValue(1);
    formulas.current.mockResolvedValue({ ...FORMULA, specificBonus: 0 });

    const result = await service.list({ page: 1, pageSize: 10 }, TODAY);

    expect(formulas.current).toHaveBeenCalledTimes(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      creatorId: 'creator-1',
      creatorName: 'Rangga Pratama',
      total: 5_500_000,
    });
  });

  it('wraps the page in the paging envelope the table reads', async () => {
    prisma.creators.findMany.mockResolvedValue([row()]);
    prisma.creators.count.mockResolvedValue(21);

    const result = await service.list({ page: 1, pageSize: 10 }, TODAY);

    expect(result).toMatchObject({
      page: 1,
      pageSize: 10,
      total: 21,
      totalPages: 3,
    });
  });

  it('reports one page for an empty roster', async () => {
    prisma.creators.findMany.mockResolvedValue([]);
    prisma.creators.count.mockResolvedValue(0);

    const result = await service.list({ page: 1, pageSize: 10 }, TODAY);

    expect(result).toEqual({
      items: [],
      page: 1,
      pageSize: 10,
      total: 0,
      totalPages: 1,
    });
  });

  it('lets a failing formula source fail the request instead of invoicing with no formula', async () => {
    prisma.creators.findMany.mockResolvedValue([row()]);
    prisma.creators.count.mockResolvedValue(1);
    formulas.current.mockRejectedValue(new Error('formula unavailable'));

    await expect(
      service.list({ page: 1, pageSize: 10 }, TODAY),
    ).rejects.toThrow('formula unavailable');
  });

  it('answers the last page when asked for one past it', async () => {
    prisma.creators.findMany.mockResolvedValue([row()]);
    prisma.creators.count.mockResolvedValue(3);

    const result = await service.list({ page: 5, pageSize: 10 }, TODAY);

    expect(prisma.creators.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 10 }),
    );
    expect(result).toMatchObject({ page: 1, totalPages: 1 });
    expect(result.items).toHaveLength(1);
  });

  it('loads content only for the contract each creator is invoiced on', async () => {
    const running = row({
      contracts: [
        {
          id: 'old',
          start_date: day(-200),
          end_date: day(-61),
          content_quota: 11,
          fixed_rate: new Prisma.Decimal('5000000'),
        },
        {
          id: 'running',
          start_date: day(-60),
          end_date: day(60),
          content_quota: 11,
          fixed_rate: new Prisma.Decimal('5500000'),
        },
      ],
    });
    prisma.creators.findMany.mockResolvedValue([running]);
    prisma.creators.count.mockResolvedValue(1);
    prisma.contents.findMany.mockResolvedValue([
      {
        id: 'late',
        contract_id: 'running',
        name: 'Evg_1',
        type: 'evergreen',
        status: 'link_submitted',
        deadline: day(-10),
        video_submitted_at: day(-8),
        platform: null,
        views: null,
        likes: null,
      },
    ]);

    const result = await service.list({ page: 1, pageSize: 10 }, TODAY);

    expect(prisma.contents.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { contract_id: { in: ['running'] } } }),
    );
    expect(result.items[0].contract.id).toBe('running');
    expect(result.items[0].components.penalty.lines[0].contentId).toBe('late');
  });

  describe('with filters', () => {
    const contractFor = (id: string, start: number, end: number) => ({
      id,
      start_date: day(start),
      end_date: day(end),
      content_quota: 11,
      fixed_rate: new Prisma.Decimal('5500000'),
    });
    const roster = [
      row({ id: 'rangga', first_name: 'Rangga', last_name: 'Pratama' }),
      row({
        id: 'nadia',
        first_name: 'Nadia',
        last_name: 'Putri',
        contracts: [contractFor('nadia-c', -200, -10)],
      }),
      row({
        id: 'kevin',
        first_name: 'Kevin',
        last_name: 'Pranata',
        contracts: [contractFor('kevin-c', 10, 100)],
      }),
    ];

    beforeEach(() => {
      prisma.creators.findMany.mockResolvedValue(roster);
    });

    it('reads the whole roster without content, then filters before paging', async () => {
      await service.list({ page: 1, pageSize: 10 }, TODAY, { q: 'rangga' });

      const [args] = prisma.creators.findMany.mock.calls[0];
      expect(args).not.toHaveProperty('skip');
      expect(args).not.toHaveProperty('take');
      expect(prisma.creators.count).not.toHaveBeenCalled();
    });

    it('finds a creator by any part of the name, in any case', async () => {
      const result = await service.list({ page: 1, pageSize: 10 }, TODAY, {
        q: 'GA PRA',
      });

      expect(result.items.map((item) => item.creatorId)).toEqual(['rangga']);
      expect(result).toMatchObject({ total: 1, totalPages: 1 });
    });

    it.each([
      ['active', 'rangga'],
      ['expired', 'nadia'],
      ['upcoming', 'kevin'],
    ] as const)(
      'keeps only creators whose invoiced contract is %s',
      async (contract, creatorId) => {
        const result = await service.list({ page: 1, pageSize: 10 }, TODAY, {
          contract,
        });

        expect(result.items.map((item) => item.creatorId)).toEqual([creatorId]);
      },
    );

    it('combines the search word and the contract status', async () => {
      const result = await service.list({ page: 1, pageSize: 10 }, TODAY, {
        q: 'pra',
        contract: 'upcoming',
      });

      expect(result.items.map((item) => item.creatorId)).toEqual(['kevin']);
    });

    it('pages the filtered creators and clamps a page past them', async () => {
      const result = await service.list({ page: 9, pageSize: 1 }, TODAY, {
        q: 'pra',
      });

      expect(result).toMatchObject({ page: 2, total: 2, totalPages: 2 });
      expect(result.items.map((item) => item.creatorId)).toEqual(['kevin']);
    });

    it('loads content only for the creators on the page', async () => {
      await service.list({ page: 1, pageSize: 10 }, TODAY, {
        contract: 'expired',
      });

      expect(prisma.contents.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { contract_id: { in: ['nadia-c'] } },
        }),
      );
    });
  });
});
