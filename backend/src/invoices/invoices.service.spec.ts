import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import type { InvoiceCreatorRow } from './invoice-rows.js';
import { FORMULA, TODAY, day } from './invoice-test-data.js';
import { InvoicesService } from './invoices.service.js';
import { RATE_FORMULA_SOURCE } from './rate-formula.js';

/** The error `promise` rejects with, for checking both its class and its body. */
async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return expect.unreachable('the call must be rejected');
}

function adjustmentRow(id: string, amount: string) {
  return {
    id,
    amount: new Prisma.Decimal(amount),
    reason: `Reason ${id}`,
    actor_user_id: 'admin-1',
    created_at: new Date('2026-09-10T02:00:00.000Z'),
  };
}

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
    contracts: {
      findUnique: vi.fn(),
    },
    invoices: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
    invoice_adjustments: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
    // The transaction client is the same stub, so each test reads what ran inside it.
    $transaction: vi.fn(),
  };
  const formulas = { current: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    formulas.current.mockResolvedValue(FORMULA);
    prisma.contents.findMany.mockResolvedValue([]);
    prisma.invoices.findMany.mockResolvedValue([]);
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(
      (work: (tx: typeof prisma) => Promise<unknown>) => work(prisma),
    );

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

  it('reads the saved status and adjustments of each invoice on the page', async () => {
    prisma.creators.findMany.mockResolvedValue([row()]);
    prisma.creators.count.mockResolvedValue(1);
    prisma.invoices.findMany.mockResolvedValue([
      {
        contract_id: 'contract-1',
        status: 'running',
        snapshot: null,
        adjustments: [adjustmentRow('adj-1', '25000.50')],
      },
    ]);

    const result = await service.list({ page: 1, pageSize: 10 }, TODAY);

    expect(prisma.invoices.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { contract_id: { in: ['contract-1'] } },
      }),
    );
    expect(result.items[0]).toMatchObject({
      invoiceStatus: 'running',
      adjustments: [
        {
          id: 'adj-1',
          amount: 25_000.5,
          reason: 'Reason adj-1',
          actorId: 'admin-1',
          createdAt: '2026-09-10T02:00:00.000Z',
        },
      ],
      snapshot: null,
      total: 5_525_000.5,
    });
  });

  it('leaves out a creator row that comes back without a contract to invoice', async () => {
    prisma.creators.findMany.mockResolvedValue([
      row({ id: 'no-contract', contracts: [] }),
      row(),
    ]);
    prisma.creators.count.mockResolvedValue(2);

    const result = await service.list({ page: 1, pageSize: 10 }, TODAY);

    expect(result.items.map((item) => item.creatorId)).toEqual(['creator-1']);
  });

  it('asks for no invoices when the page has no creators', async () => {
    prisma.creators.findMany.mockResolvedValue([]);
    prisma.creators.count.mockResolvedValue(0);

    await service.list({ page: 1, pageSize: 10 }, TODAY);

    expect(prisma.invoices.findMany).not.toHaveBeenCalled();
  });

  describe('addAdjustment', () => {
    const input = { amount: -1500.5, reason: 'Correction for overpayment' };

    beforeEach(() => {
      prisma.contracts.findUnique.mockResolvedValue({ id: 'contract-1' });
      prisma.invoices.upsert.mockResolvedValue({
        id: 'invoice-1',
        status: 'running',
      });
      prisma.invoice_adjustments.create.mockResolvedValue(
        adjustmentRow('adj-1', '-1500.50'),
      );
    });

    // OWASP Top 10:2025 A08 (Software and Data Integrity Failures): one locked transaction.
    it('locks the contract, then saves the adjustment on its running invoice as the actor', async () => {
      const result = await service.addAdjustment(
        'contract-1',
        input,
        'admin-1',
      );

      expect(result).toEqual({
        id: 'adj-1',
        amount: -1500.5,
        reason: 'Reason adj-1',
        actorId: 'admin-1',
        createdAt: '2026-09-10T02:00:00.000Z',
        invoiceStatus: 'running',
      });
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'ReadCommitted',
      });
      expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.invoices.upsert.mock.invocationCallOrder[0],
      );
      expect(prisma.invoices.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { contract_id: 'contract-1' },
          create: { contract_id: 'contract-1' },
          update: {},
        }),
      );
      const [{ data }] = prisma.invoice_adjustments.create.mock.calls[0];
      expect(data).toMatchObject({
        invoice_id: 'invoice-1',
        reason: 'Correction for overpayment',
        actor_user_id: 'admin-1',
      });
      expect(data.amount.toFixed(2)).toBe('-1500.50');
      expect(data).not.toHaveProperty('created_at');
    });

    it('answers 404 for an unknown contract without opening an invoice', async () => {
      prisma.contracts.findUnique.mockResolvedValue(null);

      const error = await rejection(
        service.addAdjustment('contract-1', input, 'admin-1'),
      );

      expect(error).toBeInstanceOf(NotFoundException);
      expect(error).toMatchObject({ response: { code: 'CONTRACT_NOT_FOUND' } });
      expect(prisma.invoices.upsert).not.toHaveBeenCalled();
    });

    // OWASP Top 10:2025 A06 (Insecure Design): the State Pattern blocks writes to a finalized invoice.
    it('rejects an adjustment on a finalized invoice without saving it', async () => {
      prisma.invoices.upsert.mockResolvedValue({
        id: 'invoice-1',
        status: 'finalized',
      });

      const error = await rejection(
        service.addAdjustment('contract-1', input, 'admin-1'),
      );

      expect(error).toBeInstanceOf(ConflictException);
      expect(error).toMatchObject({ response: { code: 'INVOICE_FINALIZED' } });
      expect(prisma.invoice_adjustments.create).not.toHaveBeenCalled();
    });
  });

  describe('finalize', () => {
    const measured = {
      id: 'measured',
      contract_id: 'contract-1',
      name: 'Evg_1',
      type: 'evergreen',
      status: 'link_submitted',
      deadline: day(-2),
      video_submitted_at: day(-2),
      platform: 'instagram',
      views: 0,
      likes: null,
    };

    /** An ended contract whose one video was on time and measured, so nothing waits for data. */
    function endedContract(overrides: Record<string, unknown> = {}) {
      return {
        id: 'contract-1',
        start_date: day(-30),
        end_date: day(-1),
        content_quota: 1,
        fixed_rate: new Prisma.Decimal('1000000'),
        creators: { access_revoke_date: null },
        contents: [measured],
        ...overrides,
      };
    }

    beforeEach(() => {
      prisma.contracts.findUnique.mockResolvedValue(endedContract());
      prisma.invoices.upsert.mockResolvedValue({
        id: 'invoice-1',
        status: 'running',
      });
      prisma.invoice_adjustments.findMany.mockResolvedValue([
        adjustmentRow('adj-1', '25000'),
        adjustmentRow('adj-2', '-0.50'),
      ]);
      prisma.invoices.updateMany.mockResolvedValue({ count: 1 });
    });

    // OWASP Top 10:2025 A08 (Software and Data Integrity Failures): the snapshot is the calculator's
    // breakdown plus every adjustment, saved in the same locked transaction as the status change.
    it('saves the calculated breakdown, the adjustments and the totals as the snapshot', async () => {
      const result = await service.finalize('contract-1', TODAY);

      expect(result).toMatchObject({
        invoiceStatus: 'finalized',
        adjustments: [
          { id: 'adj-1', amount: 25_000, actorId: 'admin-1' },
          { id: 'adj-2', amount: -0.5, actorId: 'admin-1' },
        ],
        snapshot: {
          fixedRate: { amount: 1_000_000, status: 'calculated' },
          additionalContent: { amount: 0, status: 'calculated' },
          performanceBonus: { amount: 0, status: 'calculated' },
          penalty: { amount: 0, status: 'calculated' },
          rawTotal: 1_024_999.5,
          total: 1_024_999.5,
          floored: false,
          finalizedAt: expect.any(String),
        },
      });
      expect(result.snapshot.adjustments).toEqual(result.adjustments);
      expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.contracts.findUnique.mock.invocationCallOrder[0],
      );
      expect(prisma.invoice_adjustments.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { invoice_id: 'invoice-1' } }),
      );
      expect(prisma.invoices.updateMany).toHaveBeenCalledWith({
        where: { id: 'invoice-1', status: 'running' },
        data: {
          status: 'finalized',
          snapshot: result.snapshot,
          finalized_at: new Date(result.snapshot.finalizedAt),
        },
      });
    });

    it('floors the snapshot total at zero when adjustments outweigh the pay', async () => {
      prisma.invoice_adjustments.findMany.mockResolvedValue([
        adjustmentRow('adj-1', '-1500000'),
      ]);

      const { snapshot } = await service.finalize('contract-1', TODAY);

      expect(snapshot).toMatchObject({
        rawTotal: -500_000,
        total: 0,
        floored: true,
      });
    });

    it('answers 404 for an unknown contract', async () => {
      prisma.contracts.findUnique.mockResolvedValue(null);

      const error = await rejection(service.finalize('contract-1', TODAY));

      expect(error).toBeInstanceOf(NotFoundException);
      expect(prisma.invoices.upsert).not.toHaveBeenCalled();
    });

    // OWASP Top 10:2025 A06 (Insecure Design): finalize waits for the day after the end date in Jakarta.
    it('refuses a contract whose last day is today in Jakarta', async () => {
      prisma.contracts.findUnique.mockResolvedValue(
        endedContract({ end_date: day(0) }),
      );

      const error = await rejection(service.finalize('contract-1', TODAY));

      expect(error).toBeInstanceOf(ConflictException);
      expect(error).toMatchObject({ response: { code: 'CONTRACT_NOT_ENDED' } });
      expect(prisma.invoices.upsert).not.toHaveBeenCalled();
    });

    it('refuses a second finalize through the finalized state', async () => {
      prisma.invoices.upsert.mockResolvedValue({
        id: 'invoice-1',
        status: 'finalized',
      });

      const error = await rejection(service.finalize('contract-1', TODAY));

      expect(error).toBeInstanceOf(ConflictException);
      expect(error).toMatchObject({ response: { code: 'INVOICE_FINALIZED' } });
      expect(prisma.invoices.updateMany).not.toHaveBeenCalled();
    });

    it('refuses to finalize while a component is waiting for data', async () => {
      prisma.contracts.findUnique.mockResolvedValue(
        endedContract({
          contents: [{ ...measured, platform: null, views: null }],
        }),
      );

      const error = await rejection(service.finalize('contract-1', TODAY));

      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect(error).toMatchObject({
        response: { code: 'INVOICE_DATA_INCOMPLETE' },
      });
      expect(prisma.invoices.updateMany).not.toHaveBeenCalled();
    });

    // OWASP Top 10:2025 A10 (Mishandling of Exceptional Conditions): a lost race is a conflict.
    it('refuses when the running invoice was finalized by another request first', async () => {
      prisma.invoices.updateMany.mockResolvedValue({ count: 0 });

      const error = await rejection(service.finalize('contract-1', TODAY));

      expect(error).toBeInstanceOf(ConflictException);
      expect(error).toMatchObject({ response: { code: 'INVOICE_FINALIZED' } });
    });
  });
});
