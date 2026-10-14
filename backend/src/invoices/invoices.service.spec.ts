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
        contents: [],
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
  };
  const formulas = { current: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    formulas.current.mockResolvedValue(FORMULA);

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
    prisma.creators.count.mockResolvedValue(0);

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
    formulas.current.mockResolvedValue({ ...FORMULA, specificContentFee: 0 });

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
});
