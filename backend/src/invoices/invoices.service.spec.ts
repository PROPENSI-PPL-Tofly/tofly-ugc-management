import { Prisma } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import type { InvoiceCreatorRow } from './invoice-rows.js';
import { FORMULA, TODAY, day } from './invoice-test-data.js';
import { INVOICE_STATUS_SOURCE, type InvoiceStatus } from './invoice-status.js';
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
      findUnique: vi.fn(),
      count: vi.fn(),
    },
    contents: {
      findMany: vi.fn(),
    },
  };
  const formulas = { current: vi.fn() };
  // A stub of the invoice pipeline: every contract is running unless a test says otherwise.
  let pipeline: Record<string, InvoiceStatus> = {};
  const statuses = {
    statuses: vi.fn((ids: readonly string[]) =>
      Promise.resolve(
        new Map(ids.map((id) => [id, pipeline[id] ?? ('accruing' as const)])),
      ),
    ),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    pipeline = {};
    formulas.current.mockResolvedValue(FORMULA);
    prisma.contents.findMany.mockResolvedValue([]);

    const module = await Test.createTestingModule({
      providers: [
        InvoicesService,
        { provide: PrismaService, useValue: prisma },
        { provide: RATE_FORMULA_SOURCE, useValue: formulas },
        { provide: INVOICE_STATUS_SOURCE, useValue: statuses },
      ],
    }).compile();

    service = module.get(InvoicesService);
  });

  const contractFor = (id: string, start: number, end: number, rate = '5500000') => ({
    id,
    start_date: day(start),
    end_date: day(end),
    content_quota: 11,
    fixed_rate: new Prisma.Decimal(rate),
  });
  // Ordered by name, as the database answers: Kevin (upcoming), Nadia (ended), Rangga (running).
  const roster = [
    row({ id: 'kevin', first_name: 'Kevin', last_name: 'Pranata', contracts: [contractFor('kevin-c', 10, 100, '1000000')] }),
    row({ id: 'nadia', first_name: 'Nadia', last_name: 'Putri', contracts: [contractFor('nadia-c', -200, -10, '2000000')] }),
    row({ id: 'rangga', first_name: 'Rangga', last_name: 'Pratama', contracts: [contractFor('rangga-c', -60, 60, '5500000')] }),
  ];
  const ids = (result: { items: { creatorId: string }[] }) => result.items.map((item) => item.creatorId);

  describe('list', () => {
    beforeEach(() => {
      prisma.creators.findMany.mockResolvedValue(roster);
    });

    it('reads the whole roster of creators with a contract, by name, in one query', async () => {
      await service.list({ page: 1, pageSize: 10 }, TODAY);

      expect(prisma.creators.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.creators.findMany).toHaveBeenCalledWith({
        where: { contracts: { some: {} } },
        select: expect.objectContaining({ id: true, contracts: expect.any(Object) }),
        orderBy: [{ first_name: 'asc' }, { last_name: 'asc' }, { id: 'asc' }],
      });
      expect(prisma.creators.count).not.toHaveBeenCalled();
    });

    it('loads the content of every listed contract once, in deadline order', async () => {
      await service.list({ page: 1, pageSize: 1 }, TODAY);

      expect(prisma.contents.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.contents.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { contract_id: { in: ['kevin-c', 'nadia-c', 'rangga-c'] } },
          orderBy: { deadline: 'asc' },
        }),
      );
    });

    it('hands each creator the content of their own contract', async () => {
      const late = (id: string, contractId: string) => ({
        id,
        contract_id: contractId,
        name: id,
        type: 'evergreen',
        status: 'link_submitted',
        deadline: day(-10),
        video_submitted_at: day(-8),
        platform: null,
        views: null,
        likes: null,
      });
      prisma.contents.findMany.mockResolvedValue([
        late('rangga-1', 'rangga-c'),
        late('rangga-2', 'rangga-c'),
        late('nadia-1', 'nadia-c'),
      ]);

      const result = await service.list({ page: 1, pageSize: 10 }, TODAY, {}, { key: 'name', order: 'asc' });
      const lines = (id: string) =>
        result.items.find((item) => item.creatorId === id)!.components.penalty.lines.map((line) => line.contentId);

      expect(lines('rangga')).toEqual(['rangga-1', 'rangga-2']);
      expect(lines('nadia')).toEqual(['nadia-1']);
      expect(lines('kevin')).toEqual([]);
    });

    it('puts what needs action first by default: ended, then running, then not started', async () => {
      const result = await service.list({ page: 1, pageSize: 10 }, TODAY);

      expect(ids(result)).toEqual(['nadia', 'rangga', 'kevin']);
    });

    it('sorts by what it is asked to', async () => {
      const byTotal = await service.list({ page: 1, pageSize: 10 }, TODAY, {}, { key: 'total', order: 'desc' });
      const byName = await service.list({ page: 1, pageSize: 10 }, TODAY, {}, { key: 'name', order: 'desc' });

      expect(ids(byTotal)).toEqual(['rangga', 'nadia', 'kevin']);
      expect(ids(byName)).toEqual(['rangga', 'nadia', 'kevin']);
    });

    it('sorts the whole filtered list before it cuts the page', async () => {
      const result = await service.list({ page: 2, pageSize: 1 }, TODAY, {}, { key: 'total', order: 'desc' });

      expect(ids(result)).toEqual(['nadia']);
      expect(result).toMatchObject({ page: 2, pageSize: 1, total: 3, totalPages: 3 });
    });

    it('calculates each creator with the current formula, and says what their invoice stands at', async () => {
      pipeline = { 'rangga-c': 'finalized' };

      const result = await service.list({ page: 1, pageSize: 10 }, TODAY, { q: 'rangga' });

      expect(formulas.current).toHaveBeenCalledTimes(1);
      expect(result.items[0]).toMatchObject({
        creatorName: 'Rangga Pratama',
        total: 5_500_000,
        invoiceStatus: 'finalized',
      });
    });

    it('finds a creator by any part of the name, in any case', async () => {
      expect(ids(await service.list({ page: 1, pageSize: 10 }, TODAY, { q: 'GA PRA' }))).toEqual(['rangga']);
    });

    it.each([
      ['active', 'rangga'],
      ['expired', 'nadia'],
      ['upcoming', 'kevin'],
    ] as const)('keeps only creators whose invoiced contract is %s', async (contract, creatorId) => {
      expect(ids(await service.list({ page: 1, pageSize: 10 }, TODAY, { contract }))).toEqual([creatorId]);
    });

    it('keeps only creators whose invoice is at the asked status', async () => {
      pipeline = { 'nadia-c': 'paid' };

      const paid = await service.list({ page: 1, pageSize: 10 }, TODAY, { status: 'paid' });
      const none = await service.list({ page: 1, pageSize: 10 }, TODAY, { status: 'finalized' });

      expect(ids(paid)).toEqual(['nadia']);
      expect(none).toMatchObject({ items: [], total: 0, totalPages: 1, page: 1 });
    });

    it('combines the filters', async () => {
      const result = await service.list({ page: 1, pageSize: 10 }, TODAY, {
        q: 'pra',
        contract: 'upcoming',
        status: 'accruing',
      });

      expect(ids(result)).toEqual(['kevin']);
    });

    it('answers the last page when asked for one past it', async () => {
      const result = await service.list({ page: 9, pageSize: 2 }, TODAY);

      expect(result).toMatchObject({ page: 2, totalPages: 2, total: 3 });
      expect(ids(result)).toEqual(['kevin']);
    });

    it('skips a creator left without a contract', async () => {
      prisma.creators.findMany.mockResolvedValue([...roster, row({ id: 'none', first_name: 'Nina', contracts: [] })]);

      expect((await service.list({ page: 1, pageSize: 10 }, TODAY)).total).toBe(3);
    });

    it('reports one page for an empty roster', async () => {
      prisma.creators.findMany.mockResolvedValue([]);

      await expect(service.list({ page: 1, pageSize: 10 }, TODAY)).resolves.toEqual({
        items: [],
        page: 1,
        pageSize: 10,
        total: 0,
        totalPages: 1,
        summary: { total: 0, runningInvoices: 0, formulaSet: true },
      });
    });

    describe('summary', () => {
      it('adds up what every listed creator is owed, across pages', async () => {
        const result = await service.list({ page: 1, pageSize: 1 }, TODAY);

        // Rangga's running Rp5.500.000 and Nadia's ended Rp2.000.000; Kevin has not started.
        expect(result.summary.total).toBe(7_500_000);
      });

      it('adds up only what the filters keep', async () => {
        const result = await service.list({ page: 1, pageSize: 10 }, TODAY, { contract: 'active' });

        expect(result.summary.total).toBe(5_500_000);
      });

      it('counts every running invoice a formula change would reach, whatever the filters', async () => {
        pipeline = { 'nadia-c': 'paid' };

        const result = await service.list({ page: 1, pageSize: 10 }, TODAY, { q: 'rangga' });

        expect(result.summary.runningInvoices).toBe(2);
      });

      it('says whether an admin has saved a formula', async () => {
        formulas.current.mockResolvedValue(null);

        const result = await service.list({ page: 1, pageSize: 10 }, TODAY);

        expect(result.summary.formulaSet).toBe(false);
      });
    });

    it('lets a failing formula source fail the request instead of invoicing with no formula', async () => {
      formulas.current.mockRejectedValue(new Error('formula unavailable'));

      await expect(service.list({ page: 1, pageSize: 10 }, TODAY)).rejects.toThrow('formula unavailable');
    });
  });

  describe('detail', () => {
    const renewed = row({
      contracts: [
        {
          id: 'renewal',
          start_date: day(-60),
          end_date: day(60),
          content_quota: 11,
          fixed_rate: new Prisma.Decimal('5500000'),
        },
        {
          id: 'first',
          start_date: day(-200),
          end_date: day(-61),
          content_quota: 11,
          fixed_rate: new Prisma.Decimal('5000000'),
        },
      ],
    });

    it('reads the one creator by id, with the columns an invoice is calculated from', async () => {
      prisma.creators.findUnique.mockResolvedValue(row());

      await service.detail('creator-1', TODAY);

      expect(prisma.creators.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'creator-1' } }),
      );
      expect(prisma.contents.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { contract_id: { in: ['contract-1'] } },
        }),
      );
    });

    it('answers the invoice, its status, the formula it was worked out with and which period it pays', async () => {
      prisma.creators.findUnique.mockResolvedValue(renewed);
      pipeline = { renewal: 'creator_acked' };

      const detail = await service.detail('creator-1', TODAY);

      expect(statuses.statuses).toHaveBeenCalledWith(['renewal']);
      expect(detail).toMatchObject({
        creatorId: 'creator-1',
        creatorName: 'Rangga Pratama',
        contract: { id: 'renewal', status: 'active' },
        invoiceStatus: 'creator_acked',
        periodNumber: 2,
        formula: FORMULA,
        total: 5_500_000,
      });
    });

    it('counts the first contract as period 1', async () => {
      prisma.creators.findUnique.mockResolvedValue(row());

      await expect(service.detail('creator-1', TODAY)).resolves.toMatchObject({
        periodNumber: 1,
      });
    });

    it('answers no formula while no admin has saved one, so the popup states no rules', async () => {
      prisma.creators.findUnique.mockResolvedValue(row());
      formulas.current.mockResolvedValue(null);

      await expect(service.detail('creator-1', TODAY)).resolves.toMatchObject({
        formula: null,
      });
    });

    it('answers null for a creator that does not exist', async () => {
      prisma.creators.findUnique.mockResolvedValue(null);

      await expect(service.detail('missing', TODAY)).resolves.toBeNull();
      expect(prisma.contents.findMany).not.toHaveBeenCalled();
    });

    it('answers null for a creator with no contract, who has nothing to invoice', async () => {
      prisma.creators.findUnique.mockResolvedValue(row({ contracts: [] }));

      await expect(service.detail('creator-1', TODAY)).resolves.toBeNull();
      expect(prisma.contents.findMany).not.toHaveBeenCalled();
    });
  });
});
