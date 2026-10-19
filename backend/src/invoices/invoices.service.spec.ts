import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
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
      findUnique: vi.fn(),
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
      groupBy: vi.fn(),
    },
    $queryRaw: vi.fn(),
    // The transaction client is the same stub, so each test reads what ran inside it.
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
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(
      (work: (tx: typeof prisma) => Promise<unknown>) => work(prisma),
    );

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
  }

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
          select: { id: true, contract_id: true, snapshot: true },
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
        invoiceStatus: 'accruing',
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

    // OWASP Top 10:2025 A08 (Software and Data Integrity Failures): the rules the totals were
    // worked out with are saved with them, so a later formula change cannot be shown beside them.
    it('saves the formula the breakdown was calculated with in the snapshot', async () => {
      const { snapshot } = await service.finalize('contract-1', TODAY);

      expect(snapshot.formula).toEqual(FORMULA);
      expect(prisma.invoices.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            snapshot: expect.objectContaining({ formula: FORMULA }),
          }),
        }),
      );
    });

    // The instant the breakdown is calculated as of is the instant the invoice is finalized at,
    // to the millisecond: the controller passes the request time, not a day.
    it('stamps the snapshot and the row with the instant the breakdown was calculated as of', async () => {
      const at = new Date('2026-09-18T09:41:27.123Z');

      const { snapshot } = await service.finalize('contract-1', at);

      expect(snapshot.finalizedAt).toBe('2026-09-18T09:41:27.123Z');
      expect(prisma.invoices.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ finalized_at: at }),
        }),
      );
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
      expect(error).toMatchObject({
        response: {
          code: 'CONTRACT_NOT_ENDED',
          message: 'Kontrak belum berakhir',
        },
      });
      expect(prisma.invoices.upsert).not.toHaveBeenCalled();
    });

    // A contract that ends early stops on the day access was revoked; its end date stays as
    // agreed, so the gate reads the last day the calculator counts, not end_date.
    it('finalizes a contract that ended early once the day after access was revoked has begun', async () => {
      prisma.contracts.findUnique.mockResolvedValue(
        endedContract({
          end_date: day(30),
          creators: { access_revoke_date: day(-1) },
        }),
      );

      const result = await service.finalize('contract-1', TODAY);

      expect(result.invoiceStatus).toBe('finalized');
      expect(prisma.invoices.updateMany).toHaveBeenCalled();
    });

    // OWASP Top 10:2025 A06 (Insecure Design): an early end waits for the day after the revocation.
    it('refuses a contract ended early whose access was revoked today in Jakarta', async () => {
      prisma.contracts.findUnique.mockResolvedValue(
        endedContract({
          end_date: day(30),
          creators: { access_revoke_date: day(0) },
        }),
      );

      const error = await rejection(service.finalize('contract-1', TODAY));

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

    it('refuses to finalize while a fee or penalty is waiting for a formula', async () => {
      formulas.current.mockResolvedValue(null);

      const error = await rejection(
        service.finalize('contract-1', TODAY, { acceptPendingBonus: true }),
      );

      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect(error).toMatchObject({
        response: { code: 'INVOICE_DATA_INCOMPLETE' },
      });
      expect(prisma.invoices.updateMany).not.toHaveBeenCalled();
    });

    describe('a performance bonus still waiting for data', () => {
      const unmeasured = { ...measured, id: 'unmeasured', views: null };

      beforeEach(() => {
        prisma.contracts.findUnique.mockResolvedValue(
          endedContract({ contents: [unmeasured] }),
        );
      });

      // OWASP Top 10:2025 A06 (Insecure Design): the admin is told before the bonus is frozen.
      it('refuses to finalize until the admin accepts freezing it', async () => {
        const error = await rejection(service.finalize('contract-1', TODAY));

        expect(error).toBeInstanceOf(UnprocessableEntityException);
        expect(error).toMatchObject({
          response: { code: 'INVOICE_BONUS_PENDING' },
        });
        expect(prisma.invoices.updateMany).not.toHaveBeenCalled();
      });

      // OWASP Top 10:2025 A08 (Software and Data Integrity Failures): the snapshot says the bonus
      // was frozen before its data was complete, so the final amount stays traceable.
      it('freezes it at what was measured once accepted, and marks the snapshot so', async () => {
        const { snapshot } = await service.finalize('contract-1', TODAY, {
          acceptPendingBonus: true,
        });

        expect(snapshot).toMatchObject({
          performanceBonus: { amount: 0, status: 'calculated' },
          performanceBonusPending: true,
          rawTotal: 1_024_999.5,
          total: 1_024_999.5,
        });
        expect(prisma.invoices.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              snapshot: expect.objectContaining({
                performanceBonusPending: true,
              }),
            }),
          }),
        );
      });
    });

    it('marks a snapshot whose bonus had all its data as not pending', async () => {
      const { snapshot } = await service.finalize('contract-1', TODAY);

      expect(snapshot.performanceBonusPending).toBe(false);
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
