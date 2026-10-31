import { Prisma } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import type { InvoiceSnapshotDto } from './dto/invoice-list.dto.js';
import type { InvoiceCreatorRow } from './invoice-rows.js';
import { FORMULA, TODAY, day } from './invoice-test-data.js';
import { INVOICE_STATUS_SOURCE, type InvoiceStatus } from './invoice-status.js';
import { InvoicesService } from './invoices.service.js';
import {
  PaymentProofService,
  type PaymentProofReader,
} from './payment-proof.service.js';
import { RATE_FORMULA_SOURCE } from './rate-formula.js';

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
      findUnique: vi.fn(),
      count: vi.fn(),
    },
    contents: {
      findMany: vi.fn(),
    },
    // The writes, the lock and the transaction are tripwires: a read that called one would be
    // caught by "reads every invoice without writing, locking or opening a transaction".
    invoices: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
    invoice_adjustments: {
      create: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
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

  // The payment proofs (PBI-13): none unless a test says otherwise.
  const proofs = {
    forContracts: vi.fn<PaymentProofReader['forContracts']>(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    proofs.forContracts.mockResolvedValue(new Map());
    pipeline = {};
    formulas.current.mockResolvedValue(FORMULA);
    prisma.contents.findMany.mockResolvedValue([]);
    prisma.invoices.findMany.mockResolvedValue([]);
    prisma.invoice_adjustments.findMany.mockResolvedValue([]);
    prisma.invoice_adjustments.groupBy.mockResolvedValue([]);

    const module = await Test.createTestingModule({
      providers: [
        InvoicesService,
        { provide: PrismaService, useValue: prisma },
        { provide: RATE_FORMULA_SOURCE, useValue: formulas },
        { provide: INVOICE_STATUS_SOURCE, useValue: statuses },
        { provide: PaymentProofService, useValue: proofs },
      ],
    }).compile();

    service = module.get(InvoicesService);
  });

  const contractFor = (
    id: string,
    start: number,
    end: number,
    rate = '5500000',
  ) => ({
    id,
    start_date: day(start),
    end_date: day(end),
    content_quota: 11,
    fixed_rate: new Prisma.Decimal(rate),
  });
  // Ordered by name, as the database answers: Kevin (upcoming), Nadia (ended), Rangga (running).
  const roster = [
    row({
      id: 'kevin',
      first_name: 'Kevin',
      last_name: 'Pranata',
      contracts: [contractFor('kevin-c', 10, 100, '1000000')],
    }),
    row({
      id: 'nadia',
      first_name: 'Nadia',
      last_name: 'Putri',
      contracts: [contractFor('nadia-c', -200, -10, '2000000')],
    }),
    row({
      id: 'rangga',
      first_name: 'Rangga',
      last_name: 'Pratama',
      contracts: [contractFor('rangga-c', -60, 60, '5500000')],
    }),
  ];
  const ids = (result: { items: { creatorId: string }[] }) =>
    result.items.map((item) => item.creatorId);

  interface SavedInvoice {
    id: string;
    contract_id: string;
    /** Whatever the jsonb column holds, a well-formed snapshot or not. */
    snapshot: InvoiceSnapshotDto | Prisma.JsonValue;
    adjustments: ReturnType<typeof adjustmentRow>[];
    /** When the creator acknowledged and confirmed receipt (13.1); absent reads as null. */
    acknowledged_at?: Date | null;
    paid_at?: Date | null;
  }

  // The creator's two moves on an invoice (13.1).
  const ACKED_AT = new Date('2026-09-14T03:00:00.000Z');
  const PAID_AT = new Date('2026-09-16T09:30:00.000Z');

  /**
   * The invoices and invoice_adjustments tables holding `saved`, answering every query by its
   * where as the database would, whichever columns or relations the service asks for.
   */
  function persist(saved: SavedInvoice[]) {
    const byContract = ({
      where,
    }: {
      where: { contract_id: { in: string[] } };
    }) =>
      saved.filter((invoice) =>
        where.contract_id.in.includes(invoice.contract_id),
      );
    const byInvoice = ({
      where,
    }: {
      where: { invoice_id: { in: string[] } };
    }) => saved.filter((invoice) => where.invoice_id.in.includes(invoice.id));

    prisma.invoices.findMany.mockImplementation(
      (args: { where: { contract_id: { in: string[] } } }) =>
        Promise.resolve(
          byContract(args).map((invoice) => ({
            acknowledged_at: null,
            paid_at: null,
            ...invoice,
            status: invoice.snapshot ? 'finalized' : 'running',
          })),
        ),
    );
    prisma.invoice_adjustments.groupBy.mockImplementation(
      (args: { where: { invoice_id: { in: string[] } } }) =>
        Promise.resolve(
          byInvoice(args)
            .filter((invoice) => invoice.adjustments.length > 0)
            .map((invoice) => ({
              invoice_id: invoice.id,
              _sum: {
                amount: invoice.adjustments.reduce(
                  (sum, adjustment) => sum.plus(adjustment.amount),
                  new Prisma.Decimal(0),
                ),
              },
            })),
        ),
    );
    prisma.invoice_adjustments.findMany.mockImplementation(
      (args: { where: { invoice_id: { in: string[] } } }) =>
        Promise.resolve(
          byInvoice(args).flatMap((invoice) =>
            invoice.adjustments.map((adjustment) => ({
              ...adjustment,
              invoice_id: invoice.id,
            })),
          ),
        ),
    );
  }

  /** A finalized breakdown whose amounts no live calculation of the test rows would give. */
  function snapshotOf(
    fixedRate: number,
    adjustments: InvoiceSnapshotDto['adjustments'] = [],
  ): InvoiceSnapshotDto {
    const component = (amount: number) => ({
      amount,
      status: 'calculated' as const,
      lines: [],
    });
    const total = adjustments.reduce(
      (sum, adjustment) => sum + adjustment.amount,
      fixedRate,
    );
    return {
      fixedRate: component(fixedRate),
      additionalContent: component(0),
      performanceBonus: component(0),
      penalty: component(0),
      adjustments,
      rawTotal: total,
      total,
      floored: false,
      finalizedAt: '2026-09-12T03:00:00.000Z',
    };
  }

  describe('list', () => {
    beforeEach(() => {
      prisma.creators.findMany.mockResolvedValue(roster);
    });

    it('reads the whole roster of creators with a contract, by name, in one query', async () => {
      await service.list({ page: 1, pageSize: 10 }, TODAY);

      expect(prisma.creators.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.creators.findMany).toHaveBeenCalledWith({
        where: { contracts: { some: {} } },
        select: expect.objectContaining({
          id: true,
          contracts: expect.any(Object),
        }),
        orderBy: [{ first_name: 'asc' }, { last_name: 'asc' }, { id: 'asc' }],
      });
      expect(prisma.creators.count).not.toHaveBeenCalled();
    });

    // PBI-13: each row says whether the admin has uploaded the payment proof, read for the
    // page alone in one query and never with the file itself.
    it("gives each row on the page its payment proof, or null, from one read of the page's contracts", async () => {
      const proof = {
        fileName: 'transfer.pdf',
        url: '/api/invoices/nadia-c/payment-proof',
        uploadedAt: '2026-10-20T03:00:00.000Z',
      };
      proofs.forContracts.mockResolvedValue(new Map([['nadia-c', proof]]));

      const { items } = await service.list({ page: 1, pageSize: 2 }, TODAY);

      expect(proofs.forContracts).toHaveBeenCalledExactlyOnceWith(
        items.map(({ contract }) => contract.id),
        'admin',
      );
      expect(items).toHaveLength(2);
      for (const item of items) {
        expect(item.paymentProof).toEqual(
          item.contract.id === 'nadia-c' ? proof : null,
        );
      }
    });

    // PBI-13 (13.1): the admin sees when the creator acknowledged and confirmed receipt.
    it('gives each row when the creator acknowledged the invoice and confirmed receipt, or null before', async () => {
      pipeline = { 'nadia-c': 'paid' };
      persist([
        {
          id: 'nadia-i',
          contract_id: 'nadia-c',
          snapshot: snapshotOf(2_000_000),
          adjustments: [],
          acknowledged_at: ACKED_AT,
          paid_at: PAID_AT,
        },
        {
          id: 'rangga-i',
          contract_id: 'rangga-c',
          snapshot: null,
          adjustments: [],
        },
      ]);

      const { items } = await service.list({ page: 1, pageSize: 10 }, TODAY);
      const confirmations = Object.fromEntries(
        items.map(({ contract, acknowledgedAt, paidAt }) => [
          contract.id,
          { acknowledgedAt, paidAt },
        ]),
      );

      expect(confirmations).toEqual({
        'nadia-c': {
          acknowledgedAt: ACKED_AT.toISOString(),
          paidAt: PAID_AT.toISOString(),
        },
        // A saved invoice the creator has not moved, and a contract with no saved invoice.
        'rangga-c': { acknowledgedAt: null, paidAt: null },
        'kevin-c': { acknowledgedAt: null, paidAt: null },
      });
    });

    it('asks for no proofs when the page is empty', async () => {
      prisma.creators.findMany.mockResolvedValue([]);

      const { items } = await service.list({ page: 1, pageSize: 10 }, TODAY);

      expect(items).toEqual([]);
      expect(proofs.forContracts).toHaveBeenCalledWith([], 'admin');
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

      const result = await service.list(
        { page: 1, pageSize: 10 },
        TODAY,
        {},
        { key: 'name', order: 'asc' },
      );
      const lines = (id: string) =>
        result.items
          .find((item) => item.creatorId === id)!
          .components.penalty.lines.map((line) => line.contentId);

      expect(lines('rangga')).toEqual(['rangga-1', 'rangga-2']);
      expect(lines('nadia')).toEqual(['nadia-1']);
      expect(lines('kevin')).toEqual([]);
    });

    // A renewed creator still owes the earlier contract's invoice its finalize and its payment.
    describe('a creator whose earlier contract has ended', () => {
      const salsa = row({
        id: 'salsa',
        first_name: 'Salsa',
        last_name: 'Amelia',
        contracts: [
          contractFor('salsa-new', -30, 150),
          contractFor('salsa-old', -200, -40),
        ],
      });
      const contracts = (result: {
        items: { contract: { id: string; period: number } }[];
      }) => result.items.map(({ contract }) => [contract.id, contract.period]);

      beforeEach(() => {
        prisma.creators.findMany.mockResolvedValue([salsa]);
      });

      it("lists the earlier contract's invoice as its own row beside the current one", async () => {
        const result = await service.list({ page: 1, pageSize: 10 }, TODAY);

        expect(contracts(result)).toEqual([
          ['salsa-old', 1],
          ['salsa-new', 2],
        ]);
        expect(result.items.every((item) => item.creatorId === 'salsa')).toBe(
          true,
        );
        expect(result).toMatchObject({
          total: 2,
          summary: { runningInvoices: 2 },
        });
      });

      it('keeps listing it once finalized, so the admin sees it Final and can take it to payment', async () => {
        pipeline = { 'salsa-old': 'finalized' };

        const result = await service.list({ page: 1, pageSize: 10 }, TODAY);

        expect(contracts(result)).toEqual([
          ['salsa-old', 1],
          ['salsa-new', 2],
        ]);
        expect(result.summary.runningInvoices).toBe(1);
      });

      it('stops listing it once paid, when nothing is left to do on it', async () => {
        pipeline = { 'salsa-old': 'paid' };

        const result = await service.list({ page: 1, pageSize: 10 }, TODAY);

        expect(contracts(result)).toEqual([['salsa-new', 2]]);
      });

      it('keeps the current contract listed whatever its invoice status', async () => {
        pipeline = { 'salsa-new': 'paid' };

        const result = await service.list({ page: 1, pageSize: 10 }, TODAY);

        expect(contracts(result)).toEqual([
          ['salsa-old', 1],
          ['salsa-new', 2],
        ]);
      });

      it('filters each row by its own contract', async () => {
        const ended = await service.list({ page: 1, pageSize: 10 }, TODAY, {
          contract: 'expired',
        });

        expect(contracts(ended)).toEqual([['salsa-old', 1]]);
      });
    });

    it('puts what needs action first by default: ended, then running, then not started', async () => {
      const result = await service.list({ page: 1, pageSize: 10 }, TODAY);

      expect(ids(result)).toEqual(['nadia', 'rangga', 'kevin']);
    });

    it('sorts by what it is asked to', async () => {
      const byTotal = await service.list(
        { page: 1, pageSize: 10 },
        TODAY,
        {},
        { key: 'total', order: 'desc' },
      );
      const byName = await service.list(
        { page: 1, pageSize: 10 },
        TODAY,
        {},
        { key: 'name', order: 'desc' },
      );

      expect(ids(byTotal)).toEqual(['rangga', 'nadia', 'kevin']);
      expect(ids(byName)).toEqual(['rangga', 'nadia', 'kevin']);
    });

    it('sorts the whole filtered list before it cuts the page', async () => {
      const result = await service.list(
        { page: 2, pageSize: 1 },
        TODAY,
        {},
        { key: 'total', order: 'desc' },
      );

      expect(ids(result)).toEqual(['nadia']);
      expect(result).toMatchObject({
        page: 2,
        pageSize: 1,
        total: 3,
        totalPages: 3,
      });
    });

    it('calculates each creator with the current formula, and says what their invoice stands at', async () => {
      pipeline = { 'rangga-c': 'finalized' };

      const result = await service.list({ page: 1, pageSize: 10 }, TODAY, {
        q: 'rangga',
      });

      expect(formulas.current).toHaveBeenCalledTimes(1);
      expect(result.items[0]).toMatchObject({
        creatorName: 'Rangga Pratama',
        total: 5_500_000,
        invoiceStatus: 'finalized',
      });
    });

    it('finds a creator by any part of the name, in any case', async () => {
      expect(
        ids(
          await service.list({ page: 1, pageSize: 10 }, TODAY, { q: 'GA PRA' }),
        ),
      ).toEqual(['rangga']);
    });

    it.each([
      ['active', 'rangga'],
      ['expired', 'nadia'],
      ['upcoming', 'kevin'],
    ] as const)(
      'keeps only creators whose invoiced contract is %s',
      async (contract, creatorId) => {
        expect(
          ids(
            await service.list({ page: 1, pageSize: 10 }, TODAY, { contract }),
          ),
        ).toEqual([creatorId]);
      },
    );

    it('keeps only creators whose invoice is at the asked status', async () => {
      pipeline = { 'nadia-c': 'paid' };

      const paid = await service.list({ page: 1, pageSize: 10 }, TODAY, {
        status: 'paid',
      });
      const none = await service.list({ page: 1, pageSize: 10 }, TODAY, {
        status: 'finalized',
      });

      expect(ids(paid)).toEqual(['nadia']);
      expect(none).toMatchObject({
        items: [],
        total: 0,
        totalPages: 1,
        page: 1,
      });
    });

    it('combines the filters', async () => {
      const result = await service.list({ page: 1, pageSize: 10 }, TODAY, {
        q: 'pra',
        contract: 'upcoming',
        status: 'accruing',
      });

      expect(ids(result)).toEqual(['kevin']);
    });

    it('narrows the roster to contracts ending in the named range, in the query itself', async () => {
      await service.list({ page: 1, pageSize: 10 }, TODAY, {
        contractEndFrom: '2026-06-01',
        contractEndTo: '2026-08-31',
      });

      expect(prisma.creators.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            contracts: {
              some: {
                end_date: {
                  gte: new Date('2026-06-01T00:00:00Z'),
                  lte: new Date('2026-08-31T00:00:00Z'),
                },
              },
            },
          },
        }),
      );
    });

    it('narrows by one open end of a range, leaving the other out of the query', async () => {
      await service.list({ page: 1, pageSize: 10 }, TODAY, {
        contractEndFrom: '2026-06-01',
      });

      expect(prisma.creators.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            contracts: { some: { end_date: { gte: new Date('2026-06-01T00:00:00Z') } } },
          },
        }),
      );
    });

    it('leaves the roster open while no range is named', async () => {
      await service.list({ page: 1, pageSize: 10 }, TODAY);

      expect(prisma.creators.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { contracts: { some: {} } } }),
      );
    });

    it('answers the last page when asked for one past it', async () => {
      const result = await service.list({ page: 9, pageSize: 2 }, TODAY);

      expect(result).toMatchObject({ page: 2, totalPages: 2, total: 3 });
      expect(ids(result)).toEqual(['kevin']);
    });

    it('skips a creator left without a contract', async () => {
      prisma.creators.findMany.mockResolvedValue([
        ...roster,
        row({ id: 'none', first_name: 'Nina', contracts: [] }),
      ]);

      expect((await service.list({ page: 1, pageSize: 10 }, TODAY)).total).toBe(
        3,
      );
    });

    it('reports one page for an empty roster', async () => {
      prisma.creators.findMany.mockResolvedValue([]);

      await expect(
        service.list({ page: 1, pageSize: 10 }, TODAY),
      ).resolves.toEqual({
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
        const result = await service.list({ page: 1, pageSize: 10 }, TODAY, {
          contract: 'active',
        });

        expect(result.summary.total).toBe(5_500_000);
      });

      it('counts every running invoice a formula change would reach, whatever the filters', async () => {
        pipeline = { 'nadia-c': 'paid' };

        const result = await service.list({ page: 1, pageSize: 10 }, TODAY, {
          q: 'rangga',
        });

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

      await expect(
        service.list({ page: 1, pageSize: 10 }, TODAY),
      ).rejects.toThrow('formula unavailable');
    });

    // Filtering needs only each invoice's status, which the status source reads. Sorting and the
    // summary need the final amount of every invoice the filters keep, so their snapshots and
    // adjustment sums are read; content only where there is no snapshot, and adjustment rows for
    // the page alone.
    describe('reading only what the listing needs', () => {
      it('reads the saved invoices of only the creators the filters keep, without their adjustment rows', async () => {
        persist([]);

        await service.list({ page: 1, pageSize: 10 }, TODAY, { q: 'rangga' });

        expect(prisma.invoices.findMany).toHaveBeenCalledTimes(1);
        expect(prisma.invoices.findMany).toHaveBeenCalledWith({
          where: { contract_id: { in: ['rangga-c'] } },
          select: {
            id: true,
            contract_id: true,
            snapshot: true,
            acknowledged_at: true,
            paid_at: true,
          },
        });
      });

      it('loads no content for an invoice whose saved snapshot holds its final breakdown', async () => {
        pipeline = { 'nadia-c': 'finalized' };
        const adjustment = adjustmentRow('adj-n', '50000');
        const snapshot = snapshotOf(1_900_000, [
          {
            id: 'adj-n',
            amount: 50_000,
            reason: 'Reason adj-n',
            actorId: 'admin-1',
            createdAt: '2026-09-10T02:00:00.000Z',
          },
        ]);
        persist([
          {
            id: 'nadia-i',
            contract_id: 'nadia-c',
            snapshot,
            adjustments: [adjustment],
          },
        ]);

        const result = await service.list({ page: 1, pageSize: 10 }, TODAY);

        expect(prisma.contents.findMany).toHaveBeenCalledTimes(1);
        expect(prisma.contents.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { contract_id: { in: ['kevin-c', 'rangga-c'] } },
          }),
        );
        expect(prisma.invoice_adjustments.groupBy).not.toHaveBeenCalled();
        expect(
          result.items.find((item) => item.creatorId === 'nadia'),
        ).toMatchObject({
          invoiceStatus: 'finalized',
          snapshot,
          components: { fixedRate: { amount: 1_900_000 } },
          adjustments: snapshot.adjustments,
          total: 1_950_000,
        });
        expect(result.summary.total).toBe(1_950_000 + 5_500_000);
      });

      it('asks for no content when every kept invoice has a snapshot', async () => {
        pipeline = { 'nadia-c': 'finalized' };
        persist([
          {
            id: 'nadia-i',
            contract_id: 'nadia-c',
            snapshot: snapshotOf(1_900_000),
            adjustments: [],
          },
        ]);

        const result = await service.list({ page: 1, pageSize: 10 }, TODAY, {
          q: 'nadia',
        });

        expect(prisma.contents.findMany).not.toHaveBeenCalled();
        expect(result.items[0].total).toBe(1_900_000);
      });

      it('still calculates a finalized invoice saved without a snapshot from its content and adjustments', async () => {
        pipeline = { 'nadia-c': 'finalized' };
        persist([
          {
            id: 'nadia-i',
            contract_id: 'nadia-c',
            snapshot: null,
            adjustments: [adjustmentRow('adj-n', '1000.25')],
          },
        ]);

        const result = await service.list({ page: 1, pageSize: 10 }, TODAY, {
          q: 'nadia',
        });

        expect(prisma.contents.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { contract_id: { in: ['nadia-c'] } },
          }),
        );
        expect(result.items[0]).toMatchObject({
          invoiceStatus: 'finalized',
          snapshot: null,
          adjustments: [{ id: 'adj-n', amount: 1000.25 }],
          total: 2_001_000.25,
        });
      });

      // OWASP Top 10:2025 A08 (Software and Data Integrity Failures): a saved value that does not
      // hold the final breakdown is not trusted as one.
      it('calculates live, like a missing one, a saved snapshot that lacks its breakdown', async () => {
        pipeline = { 'nadia-c': 'finalized' };
        prisma.creators.findUnique.mockResolvedValue(roster[1]);
        persist([
          {
            id: 'nadia-i',
            contract_id: 'nadia-c',
            snapshot: { finalizedAt: '2026-09-12T03:00:00.000Z' },
            adjustments: [],
          },
        ]);

        const result = await service.list({ page: 1, pageSize: 10 }, TODAY, {
          q: 'nadia',
        });
        const detail = await service.detail('nadia', TODAY);

        expect(prisma.contents.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { contract_id: { in: ['nadia-c'] } },
          }),
        );
        expect(result.items[0]).toMatchObject({
          invoiceStatus: 'finalized',
          snapshot: null,
          total: 2_000_000,
        });
        expect(detail).toMatchObject({
          invoiceStatus: 'finalized',
          snapshot: null,
          total: 2_000_000,
        });
      });

      it('sorts and sums every kept invoice with the adjustments the database adds up, reading adjustment rows for the page only', async () => {
        persist([
          {
            id: 'nadia-i',
            contract_id: 'nadia-c',
            snapshot: null,
            adjustments: [
              adjustmentRow('adj-n1', '4000000.20'),
              adjustmentRow('adj-n2', '0.05'),
            ],
          },
          {
            id: 'rangga-i',
            contract_id: 'rangga-c',
            snapshot: null,
            adjustments: [
              adjustmentRow('adj-r1', '25000.50'),
              adjustmentRow('adj-r2', '-0.50'),
            ],
          },
        ]);
        const byTotal = { key: 'total', order: 'desc' } as const;

        const first = await service.list(
          { page: 1, pageSize: 1 },
          TODAY,
          {},
          byTotal,
        );

        // Nadia's Rp2.000.000 plus Rp4.000.000,25 of adjustments outranks Rangga's Rp5.525.000,
        // though only Nadia is on the page.
        expect(ids(first)).toEqual(['nadia']);
        expect(first.items[0]).toMatchObject({
          rawTotal: 6_000_000.25,
          total: 6_000_000.25,
        });
        expect(
          first.items[0].adjustments.map((adjustment) => adjustment.id),
        ).toEqual(['adj-n1', 'adj-n2']);
        expect(first).toMatchObject({ page: 1, total: 3, totalPages: 3 });
        expect(first.summary.total).toBe(11_525_000.25);
        expect(prisma.invoice_adjustments.groupBy).toHaveBeenCalledWith({
          by: ['invoice_id'],
          where: { invoice_id: { in: ['nadia-i', 'rangga-i'] } },
          _sum: { amount: true },
        });
        expect(prisma.invoice_adjustments.findMany).toHaveBeenCalledTimes(1);
        expect(prisma.invoice_adjustments.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { invoice_id: { in: ['nadia-i'] } },
            orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
          }),
        );

        const second = await service.list(
          { page: 2, pageSize: 1 },
          TODAY,
          {},
          byTotal,
        );

        expect(ids(second)).toEqual(['rangga']);
        expect(second.items[0]).toMatchObject({
          total: 5_525_000,
          adjustments: [
            { id: 'adj-r1', amount: 25_000.5 },
            { id: 'adj-r2', amount: -0.5 },
          ],
        });
        expect(second.summary.total).toBe(11_525_000.25);
      });

      it('reads no adjustments while no kept invoice has been saved', async () => {
        persist([]);

        const result = await service.list({ page: 1, pageSize: 10 }, TODAY);

        expect(prisma.invoice_adjustments.groupBy).not.toHaveBeenCalled();
        expect(prisma.invoice_adjustments.findMany).not.toHaveBeenCalled();
        expect(
          result.items.every((item) => item.adjustments.length === 0),
        ).toBe(true);
      });
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

    it("answers the contract's payment proof, or null before one is uploaded", async () => {
      prisma.creators.findUnique.mockResolvedValue(renewed);
      const proof = {
        fileName: 'transfer.pdf',
        url: '/api/invoices/renewal/payment-proof',
        uploadedAt: '2026-10-20T03:00:00.000Z',
      };
      proofs.forContracts.mockResolvedValue(new Map([['renewal', proof]]));

      await expect(service.detail('creator-1', TODAY)).resolves.toMatchObject({
        paymentProof: proof,
      });
      expect(proofs.forContracts).toHaveBeenCalledWith(['renewal'], 'admin');

      proofs.forContracts.mockResolvedValue(new Map());
      await expect(service.detail('creator-1', TODAY)).resolves.toMatchObject({
        paymentProof: null,
      });
    });

    it('answers when the creator acknowledged and confirmed receipt, or null before', async () => {
      prisma.creators.findUnique.mockResolvedValue(row());
      pipeline = { 'contract-1': 'creator_acked' };
      persist([
        {
          id: 'invoice-1',
          contract_id: 'contract-1',
          snapshot: snapshotOf(5_500_000),
          adjustments: [],
          acknowledged_at: ACKED_AT,
        },
      ]);

      await expect(service.detail('creator-1', TODAY)).resolves.toMatchObject({
        acknowledgedAt: ACKED_AT.toISOString(),
        paidAt: null,
      });
    });

    it('answers neither move for a contract with no saved invoice yet', async () => {
      prisma.creators.findUnique.mockResolvedValue(row());

      await expect(service.detail('creator-1', TODAY)).resolves.toMatchObject({
        acknowledgedAt: null,
        paidAt: null,
      });
    });

    it('answers the contract it is asked for, with the period it pays', async () => {
      prisma.creators.findUnique.mockResolvedValue(renewed);

      const detail = await service.detail('creator-1', TODAY, 'first');

      expect(statuses.statuses).toHaveBeenCalledWith(['first']);
      expect(detail).toMatchObject({
        contract: { id: 'first', status: 'expired', period: 1 },
        periodNumber: 1,
        total: 5_000_000,
      });
    });

    // OWASP Top 10:2025 A01 (Broken Access Control): a contract id names one creator's contract;
    // another creator's is not reached through this one's invoice.
    it('answers null for a contract the creator does not hold', async () => {
      prisma.creators.findUnique.mockResolvedValue(renewed);

      await expect(
        service.detail('creator-1', TODAY, 'someone-elses'),
      ).resolves.toBeNull();
      expect(prisma.contents.findMany).not.toHaveBeenCalled();
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

    // OWASP Top 10:2025 A08 (Software and Data Integrity Failures): a finalized invoice's rules
    // are the ones its saved totals were worked out with, whatever the formula is now.
    describe('a finalized invoice', () => {
      const atFinalization = {
        ...FORMULA,
        latePenaltyPerDay: 5_000,
        specificBonus: 250_000,
      };

      beforeEach(() => {
        pipeline = { 'contract-1': 'finalized' };
        prisma.creators.findUnique.mockResolvedValue(row());
      });

      it('answers the formula saved with its snapshot, not the current one', async () => {
        const snapshot = { ...snapshotOf(5_500_000), formula: atFinalization };
        persist([
          {
            id: 'invoice-1',
            contract_id: 'contract-1',
            snapshot,
            adjustments: [],
          },
        ]);

        const detail = await service.detail('creator-1', TODAY);

        expect(detail).toMatchObject({
          formula: atFinalization,
          snapshot,
          total: 5_500_000,
        });
      });

      it('answers no formula for a snapshot saved before formulas were kept with it', async () => {
        persist([
          {
            id: 'invoice-1',
            contract_id: 'contract-1',
            snapshot: snapshotOf(5_500_000),
            adjustments: [],
          },
        ]);

        const detail = await service.detail('creator-1', TODAY);

        expect(detail).toMatchObject({ formula: null, total: 5_500_000 });
      });

      it('answers a formula of null kept with a snapshot finalized while none was saved', async () => {
        persist([
          {
            id: 'invoice-1',
            contract_id: 'contract-1',
            snapshot: { ...snapshotOf(5_500_000), formula: null },
            adjustments: [],
          },
        ]);

        await expect(service.detail('creator-1', TODAY)).resolves.toMatchObject(
          { formula: null },
        );
      });
    });
  });

  it('reads the saved status and adjustments of each invoice on the page', async () => {
    prisma.creators.findMany.mockResolvedValue([row()]);
    prisma.creators.count.mockResolvedValue(1);
    persist([
      {
        id: 'invoice-1',
        contract_id: 'contract-1',
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
      invoiceStatus: 'accruing',
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

  // OWASP Top 10:2025 A08 (Software and Data Integrity Failures): a finalized invoice is listed
  // from its saved snapshot, not recalculated.
  it('lists a finalized invoice with its saved snapshot', async () => {
    pipeline = { 'contract-1': 'finalized' };
    const component = (amount: number) => ({
      amount,
      status: 'calculated' as const,
      lines: [],
    });
    const snapshot = {
      fixedRate: component(5_500_000),
      additionalContent: component(0),
      performanceBonus: component(0),
      penalty: component(0),
      adjustments: [
        {
          id: 'adj-1',
          amount: 25_000,
          reason: 'Reason adj-1',
          actorId: 'admin-1',
          createdAt: '2026-09-10T02:00:00.000Z',
        },
      ],
      rawTotal: 5_525_000,
      total: 5_525_000,
      floored: false,
      finalizedAt: '2026-09-12T03:00:00.000Z',
    };
    prisma.creators.findMany.mockResolvedValue([row()]);
    prisma.creators.count.mockResolvedValue(1);
    persist([
      {
        id: 'invoice-1',
        contract_id: 'contract-1',
        snapshot,
        adjustments: [adjustmentRow('adj-1', '25000')],
      },
    ]);

    const result = await service.list({ page: 1, pageSize: 10 }, TODAY);

    expect(result.items[0]).toMatchObject({
      invoiceStatus: 'finalized',
      snapshot,
      rawTotal: 5_525_000,
      total: 5_525_000,
      floored: false,
    });
  });

  // The InvoiceStatusSource port answers where an invoice stands; the saved lifecycle row only
  // carries the adjustments and snapshot. In the app the port reads that same row, so the two
  // agree; these pin that the service never second-guesses the port when they do not.
  // GET /me/invoices (13.1): every invoice of one creator, calculated once for all their
  // contracts. Who may open a proof and the comment threads are the caller's to add.
  describe('forCreator', () => {
    const renewed = row({
      contracts: [
        contractFor('renewal', -60, 60),
        contractFor('first', -200, -61, '5000000'),
        contractFor('next', 61, 200, '6000000'),
      ],
    });

    it('reads the one creator by id, with the columns an invoice is calculated from', async () => {
      prisma.creators.findUnique.mockResolvedValue(renewed);

      await service.forCreator('creator-1', TODAY);

      expect(prisma.creators.findUnique).toHaveBeenCalledExactlyOnceWith({
        where: { id: 'creator-1' },
        select: expect.objectContaining({
          id: true,
          contracts: expect.any(Object),
        }),
      });
    });

    it("answers every one of the creator's contracts, newest period first, each with its status, period, formula and the creator's moves", async () => {
      prisma.creators.findUnique.mockResolvedValue(renewed);
      pipeline = { first: 'paid' };
      persist([
        {
          id: 'first-i',
          contract_id: 'first',
          snapshot: snapshotOf(4_800_000),
          adjustments: [],
          acknowledged_at: ACKED_AT,
          paid_at: PAID_AT,
        },
      ]);

      const invoices = await service.forCreator('creator-1', TODAY);

      expect(
        invoices.map((invoice) => [
          invoice.contract.id,
          invoice.periodNumber,
          invoice.contract.status,
          invoice.invoiceStatus,
        ]),
      ).toEqual([
        ['next', 3, 'upcoming', 'accruing'],
        ['renewal', 2, 'active', 'accruing'],
        ['first', 1, 'expired', 'paid'],
      ]);
      expect(invoices[2]).toMatchObject({
        creatorId: 'creator-1',
        creatorName: 'Rangga Pratama',
        snapshot: snapshotOf(4_800_000),
        total: 4_800_000,
        acknowledgedAt: ACKED_AT.toISOString(),
        paidAt: PAID_AT.toISOString(),
      });
      expect(invoices[1]).toMatchObject({
        snapshot: null,
        total: 5_500_000,
        formula: FORMULA,
        acknowledgedAt: null,
        paidAt: null,
      });
    });

    it('reads content, statuses, saved invoices and the formula once for all the contracts', async () => {
      prisma.creators.findUnique.mockResolvedValue(renewed);
      persist([]);
      const everyContract = ['renewal', 'first', 'next'];

      await service.forCreator('creator-1', TODAY);

      expect(prisma.contents.findMany).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          where: { contract_id: { in: everyContract } },
          orderBy: { deadline: 'asc' },
        }),
      );
      expect(statuses.statuses).toHaveBeenCalledExactlyOnceWith(everyContract);
      expect(prisma.invoices.findMany).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          where: { contract_id: { in: everyContract } },
        }),
      );
      expect(formulas.current).toHaveBeenCalledTimes(1);
    });

    // The stub answers every column whatever is selected, so the select itself is pinned: a
    // column left out would read as a move the creator never made.
    it("reads when the creator made each move with the saved invoices' adjustments and snapshots", async () => {
      prisma.creators.findUnique.mockResolvedValue(row());

      await service.forCreator('creator-1', TODAY);

      expect(prisma.invoices.findMany).toHaveBeenCalledWith({
        where: { contract_id: { in: ['contract-1'] } },
        select: expect.objectContaining({
          contract_id: true,
          snapshot: true,
          acknowledged_at: true,
          paid_at: true,
        }),
      });
    });

    it('calculates a contract with no content from no content at all', async () => {
      prisma.creators.findUnique.mockResolvedValue(
        row({ contracts: [contractFor('contract-1', -60, -1)] }),
      );

      const [invoice] = await service.forCreator('creator-1', TODAY);

      const { fixedRate, additionalContent, performanceBonus, penalty } =
        invoice.components;
      expect(fixedRate.lines).toEqual([
        expect.objectContaining({ basis: { delivered: 0, quota: 11 } }),
      ]);
      expect([
        ...additionalContent.lines,
        ...performanceBonus.lines,
        ...penalty.lines,
      ]).toEqual([]);
    });

    // OWASP Top 10:2025 A08: a finalized invoice keeps the rules it was frozen with.
    it('answers a finalized invoice with the formula saved in its snapshot', async () => {
      prisma.creators.findUnique.mockResolvedValue(row());
      pipeline = { 'contract-1': 'finalized' };
      const atFinalization = { ...FORMULA, specificBonus: 250_000 };
      persist([
        {
          id: 'invoice-1',
          contract_id: 'contract-1',
          snapshot: { ...snapshotOf(5_500_000), formula: atFinalization },
          adjustments: [],
        },
      ]);

      const [invoice] = await service.forCreator('creator-1', TODAY);

      expect(invoice.formula).toEqual(atFinalization);
    });

    it('leaves the payment proof to the caller, who knows whose link to give', async () => {
      prisma.creators.findUnique.mockResolvedValue(row());

      const [invoice] = await service.forCreator('creator-1', TODAY);

      expect(proofs.forContracts).not.toHaveBeenCalled();
      expect(invoice).not.toHaveProperty('paymentProof');
    });

    it.each([
      ['does not exist', null],
      ['holds no contract', row({ contracts: [] })],
    ])(
      'answers no invoices for a creator who %s, reading nothing else',
      async (_, creator) => {
        prisma.creators.findUnique.mockResolvedValue(creator);

        await expect(service.forCreator('creator-1', TODAY)).resolves.toEqual(
          [],
        );
        expect(prisma.contents.findMany).not.toHaveBeenCalled();
        expect(statuses.statuses).not.toHaveBeenCalled();
      },
    );
  });

  describe('the status source is the one authority on the invoice status', () => {
    const saved = (status: 'running' | 'finalized') => [
      {
        contract_id: 'contract-1',
        status,
        snapshot: null,
        adjustments: [],
      },
    ];

    it.each([
      ['accruing', 'finalized'],
      ['finalized', 'running'],
      ['creator_acked', 'finalized'],
      ['payment_uploaded', 'finalized'],
      ['paid', 'running'],
    ] as const)(
      'lists and details %s when the saved row says %s',
      async (source, stored) => {
        pipeline = { 'contract-1': source };
        prisma.creators.findMany.mockResolvedValue([row()]);
        prisma.creators.findUnique.mockResolvedValue(row());
        prisma.invoices.findMany.mockResolvedValue(saved(stored));

        const listed = await service.list({ page: 1, pageSize: 10 }, TODAY);
        const detail = await service.detail('creator-1', TODAY);

        expect(listed.items[0].invoiceStatus).toBe(source);
        expect(detail?.invoiceStatus).toBe(source);
      },
    );

    it('filters and counts running invoices by the status the source answers', async () => {
      pipeline = { 'contract-1': 'accruing' };
      prisma.creators.findMany.mockResolvedValue([row()]);
      prisma.invoices.findMany.mockResolvedValue(saved('finalized'));

      const accruing = await service.list({ page: 1, pageSize: 10 }, TODAY, {
        status: 'accruing',
      });
      const finalized = await service.list({ page: 1, pageSize: 10 }, TODAY, {
        status: 'finalized',
      });

      expect(accruing.total).toBe(1);
      expect(accruing.summary.runningInvoices).toBe(1);
      expect(finalized.total).toBe(0);
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

  // Command query separation: answering an invoice never writes, locks or opens a transaction.
  it('reads every invoice without writing, locking or opening a transaction', async () => {
    prisma.creators.findMany.mockResolvedValue([row()]);
    prisma.creators.findUnique.mockResolvedValue(row());

    await service.list({ page: 1, pageSize: 10 }, TODAY);
    await service.detail('creator-1', TODAY);
    await service.forCreator('creator-1', TODAY);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.invoices.upsert).not.toHaveBeenCalled();
    expect(prisma.invoices.updateMany).not.toHaveBeenCalled();
    expect(prisma.invoice_adjustments.create).not.toHaveBeenCalled();
  });

  // The admin's commands live in InvoiceCommandService; this service only answers invoices.
  it('offers no command that changes an invoice', () => {
    const methods = Object.getOwnPropertyNames(InvoicesService.prototype);

    expect(methods).not.toContain('addAdjustment');
    expect(methods).not.toContain('finalize');
  });
});
