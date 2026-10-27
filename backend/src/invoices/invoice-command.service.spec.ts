import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { FORMULA, TODAY, day } from './invoice-test-data.js';
import { InvoiceCommandService } from './invoice-command.service.js';
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

describe('InvoiceCommandService', () => {
  let service: InvoiceCommandService;

  const prisma = {
    contracts: {
      findUnique: vi.fn(),
    },
    invoices: {
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
    prisma.invoice_adjustments.findMany.mockResolvedValue([]);
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(
      (work: (tx: typeof prisma) => Promise<unknown>) => work(prisma),
    );

    // Only the database and the formula: the commands need neither the status pipeline nor the
    // payment proofs the reads use, and the module would not compile if they asked for them.
    const module = await Test.createTestingModule({
      providers: [
        InvoiceCommandService,
        { provide: PrismaService, useValue: prisma },
        { provide: RATE_FORMULA_SOURCE, useValue: formulas },
      ],
    }).compile();

    service = module.get(InvoiceCommandService);
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

    // OWASP Top 10:2025 A05 (Injection): the contract id reaches the lock as a bound parameter.
    it('locks the contract with its id bound as a parameter, never spliced into the SQL', async () => {
      const id = "contract-1'; DROP TABLE invoices; --";

      await service.addAdjustment(id, input, 'admin-1');

      const [lock] = prisma.$queryRaw.mock.calls[0];
      expect(lock.text).toBe(
        'SELECT id FROM contracts WHERE id = $1::uuid FOR UPDATE',
      );
      expect(lock.values).toEqual([id]);
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
      const result = await service.finalize('contract-1', 'admin-9', TODAY);

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
          // Who finalized, from the session (13.1: every move keeps its actor).
          finalized_by: 'admin-9',
        },
      });
    });

    // OWASP Top 10:2025 A05 (Injection): the contract id reaches the lock as a bound parameter.
    it('locks the contract with its id bound as a parameter, never spliced into the SQL', async () => {
      const id = "contract-1'; DROP TABLE invoices; --";

      await service.finalize(id, 'admin-9', TODAY);

      const [lock] = prisma.$queryRaw.mock.calls[0];
      expect(lock.text).toBe(
        'SELECT id FROM contracts WHERE id = $1::uuid FOR UPDATE',
      );
      expect(lock.values).toEqual([id]);
    });

    // OWASP Top 10:2025 A08 (Software and Data Integrity Failures): the rules the totals were
    // worked out with are saved with them, so a later formula change cannot be shown beside them.
    it('saves the formula the breakdown was calculated with in the snapshot', async () => {
      const { snapshot } = await service.finalize(
        'contract-1',
        'admin-9',
        TODAY,
      );

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

      const { snapshot } = await service.finalize('contract-1', 'admin-9', at);

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

      const { snapshot } = await service.finalize(
        'contract-1',
        'admin-9',
        TODAY,
      );

      expect(snapshot).toMatchObject({
        rawTotal: -500_000,
        total: 0,
        floored: true,
      });
    });

    it('answers 404 for an unknown contract', async () => {
      prisma.contracts.findUnique.mockResolvedValue(null);

      const error = await rejection(
        service.finalize('contract-1', 'admin-9', TODAY),
      );

      expect(error).toBeInstanceOf(NotFoundException);
      expect(prisma.invoices.upsert).not.toHaveBeenCalled();
    });

    // OWASP Top 10:2025 A06 (Insecure Design): finalize waits for the day after the end date in Jakarta.
    it('refuses a contract whose last day is today in Jakarta', async () => {
      prisma.contracts.findUnique.mockResolvedValue(
        endedContract({ end_date: day(0) }),
      );

      const error = await rejection(
        service.finalize('contract-1', 'admin-9', TODAY),
      );

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

      const result = await service.finalize('contract-1', 'admin-9', TODAY);

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

      const error = await rejection(
        service.finalize('contract-1', 'admin-9', TODAY),
      );

      expect(error).toMatchObject({ response: { code: 'CONTRACT_NOT_ENDED' } });
      expect(prisma.invoices.upsert).not.toHaveBeenCalled();
    });

    it('refuses a second finalize through the finalized state', async () => {
      prisma.invoices.upsert.mockResolvedValue({
        id: 'invoice-1',
        status: 'finalized',
      });

      const error = await rejection(
        service.finalize('contract-1', 'admin-9', TODAY),
      );

      expect(error).toBeInstanceOf(ConflictException);
      expect(error).toMatchObject({ response: { code: 'INVOICE_FINALIZED' } });
      expect(prisma.invoices.updateMany).not.toHaveBeenCalled();
    });

    it('refuses to finalize while a fee or penalty is waiting for a formula', async () => {
      formulas.current.mockResolvedValue(null);

      const error = await rejection(
        service.finalize('contract-1', 'admin-9', TODAY, {
          acceptPendingBonus: true,
        }),
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
        const error = await rejection(
          service.finalize('contract-1', 'admin-9', TODAY),
        );

        expect(error).toBeInstanceOf(UnprocessableEntityException);
        expect(error).toMatchObject({
          response: { code: 'INVOICE_BONUS_PENDING' },
        });
        expect(prisma.invoices.updateMany).not.toHaveBeenCalled();
      });

      // OWASP Top 10:2025 A08 (Software and Data Integrity Failures): the snapshot says the bonus
      // was frozen before its data was complete, so the final amount stays traceable.
      it('freezes it at what was measured once accepted, and marks the snapshot so', async () => {
        const { snapshot } = await service.finalize(
          'contract-1',
          'admin-9',
          TODAY,
          {
            acceptPendingBonus: true,
          },
        );

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
      const { snapshot } = await service.finalize(
        'contract-1',
        'admin-9',
        TODAY,
      );

      expect(snapshot.performanceBonusPending).toBe(false);
    });

    // OWASP Top 10:2025 A10 (Mishandling of Exceptional Conditions): a lost race is a conflict.
    it('refuses when the running invoice was finalized by another request first', async () => {
      prisma.invoices.updateMany.mockResolvedValue({ count: 0 });

      const error = await rejection(
        service.finalize('contract-1', 'admin-9', TODAY),
      );

      expect(error).toBeInstanceOf(ConflictException);
      expect(error).toMatchObject({ response: { code: 'INVOICE_FINALIZED' } });
    });
  });
});
