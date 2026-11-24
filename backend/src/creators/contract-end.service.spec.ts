import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { ContractEndAudit } from './contract-end-audit.js';
import { ContractEndService, type ContractEndClient } from './contract-end.service.js';

// 10:00 WIB on 24 November 2026.
const NOW = new Date('2026-11-24T03:00:00Z');
const CREATOR_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ID = '99999999-9999-4999-8999-999999999999';
const PAST_ID = '22222222-2222-4222-8222-000000000001';
const RUNNING_ID = '22222222-2222-4222-8222-000000000002';
const NEXT_ID = '22222222-2222-4222-8222-000000000003';

function day(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** Period 1 ended and paid, period 2 running today, period 3 waiting to start. */
function periods(overrides: Partial<Record<'past' | 'running' | 'next', object | null>> = {}) {
  const rows = {
    past: {
      id: PAST_ID,
      start_date: day('2026-03-01'),
      end_date: day('2026-08-31'),
      original_end_date: null,
      invoice: { status: 'paid' },
    },
    running: {
      id: RUNNING_ID,
      start_date: day('2026-09-01'),
      end_date: day('2026-12-15'),
      original_end_date: null,
      invoice: null,
    },
    next: {
      id: NEXT_ID,
      start_date: day('2026-12-16'),
      end_date: day('2027-03-15'),
      original_end_date: null,
      invoice: { status: 'running' },
    },
  };
  return (['past', 'running', 'next'] as const).flatMap((key) => {
    const override = key in overrides ? overrides[key] : {};
    return override === null ? [] : [{ ...rows[key], ...override }];
  });
}

const CONTENTS = [
  { id: 'done', name: 'Evg_1', deadline: day('2026-11-10'), status: 'link_submitted' },
  { id: 'due-last-day', name: 'Evg_2', deadline: day('2026-11-30'), status: 'draft_review' },
  { id: 'due-after', name: 'Evg_3', deadline: day('2026-12-08'), status: 'scheduled' },
];

const PAY = {
  invoice: 'pay',
  lastDay: '2026-11-30',
  reason: 'breach',
  note: '  Konten diunggah ulang dari creator lain.  ',
};
const CANCEL = { ...PAY, invoice: 'cancel', reason: 'fraud', lastDay: undefined };

function setup(contracts: unknown[] | null = periods()) {
  const creator =
    contracts === null
      ? null
      : { first_name: 'Rangga', middle_name: null, last_name: 'Pratama', contracts };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    creators: { findUnique: vi.fn().mockResolvedValue(creator) },
    contracts: {
      update: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    contents: {
      findMany: vi.fn().mockResolvedValue(CONTENTS),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    invoices: { upsert: vi.fn().mockResolvedValue({ id: 'invoice-2' }) },
  };
  const prisma = {
    $transaction: vi.fn((work: (client: typeof tx) => Promise<unknown>) => work(tx)),
    creators: { findUnique: vi.fn().mockResolvedValue(creator) },
    contents: { findMany: vi.fn().mockResolvedValue(CONTENTS) },
  };
  const audit = { recordBy: vi.fn().mockResolvedValue(undefined) };
  const service = new ContractEndService(
    prisma as unknown as ContractEndClient,
    audit as ContractEndAudit,
  );
  return { tx, prisma, audit, service };
}

type Setup = ReturnType<typeof setup>;

function lockStatements(tx: Setup['tx']): { sql: string; values: unknown[] }[] {
  return tx.$queryRaw.mock.calls.map((call: unknown[]) => {
    const query = call[0] as Prisma.Sql;
    return { sql: query.sql, values: query.values };
  });
}

function expectNothingWritten({ tx, audit }: Setup): void {
  expect(tx.contracts.update).not.toHaveBeenCalled();
  expect(tx.contracts.deleteMany).not.toHaveBeenCalled();
  expect(tx.contents.updateMany).not.toHaveBeenCalled();
  expect(tx.invoices.upsert).not.toHaveBeenCalled();
  expect(audit.recordBy).not.toHaveBeenCalled();
}

async function refusal(work: Promise<unknown>): Promise<{ error: unknown; body: unknown }> {
  const error = await work.then(
    () => {
      throw new Error('expected a rejection');
    },
    (caught: unknown) => caught,
  );
  return {
    error,
    body: (error as { getResponse(): unknown }).getResponse(),
  };
}

describe('ContractEndService.end', () => {
  // OWASP A06:2025: the creator, then the contract, locked the way Finalize locks it, so two
  // admins never both end the same contract and no Finalize reads it half-ended.
  it('locks the creator and then the contract, with the lock Finalize takes', async () => {
    const setupResult = setup();
    await setupResult.service.end(CREATOR_ID, RUNNING_ID, PAY, NOW, ADMIN_ID);

    expect(lockStatements(setupResult.tx)).toEqual([
      {
        sql: 'SELECT id FROM creators WHERE id = ?::uuid FOR UPDATE',
        values: [CREATOR_ID],
      },
      {
        sql: 'SELECT id FROM contracts WHERE id = ?::uuid FOR UPDATE',
        values: [RUNNING_ID],
      },
    ]);
    // The periods are read after both locks, so a second admin sees the first one's end.
    expect(setupResult.tx.$queryRaw.mock.invocationCallOrder[1]).toBeLessThan(
      setupResult.tx.creators.findUnique.mock.invocationCallOrder[0],
    );
  });

  it('keeps the original end, moves the end to the last day and records why and by whom', async () => {
    const { tx, service } = setup();
    await service.end(CREATOR_ID, RUNNING_ID, PAY, NOW, ADMIN_ID);

    expect(tx.contracts.update).toHaveBeenCalledExactlyOnceWith({
      where: { id: RUNNING_ID },
      data: {
        end_date: day('2026-11-30'),
        original_end_date: day('2026-12-15'),
        end_reason: 'breach',
        end_note: 'Konten diunggah ulang dari creator lain.',
        ended_at: NOW,
        ended_by: ADMIN_ID,
        updated_at: NOW,
      },
    });
  });

  it('closes only what is due after the last day and still not delivered', async () => {
    const { tx, service } = setup();
    await service.end(CREATOR_ID, RUNNING_ID, PAY, NOW, ADMIN_ID);

    expect(tx.contents.findMany).toHaveBeenCalledWith({
      where: { contract_id: RUNNING_ID },
      select: { id: true, name: true, deadline: true, status: true },
      orderBy: [{ deadline: 'asc' }, { id: 'asc' }],
    });
    // A link handed in between the read and this write keeps its content open.
    expect(tx.contents.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: { in: ['due-after'] }, status: { not: 'link_submitted' } },
      data: { closed_at: NOW, updated_at: NOW },
    });
  });

  it('deletes the periods that have not started, and only this creator’s', async () => {
    const { tx, service } = setup();
    await service.end(CREATOR_ID, RUNNING_ID, PAY, NOW, ADMIN_ID);

    expect(tx.contracts.deleteMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: { in: [NEXT_ID] }, creator_id: CREATOR_ID },
    });
  });

  it('leaves a paid end’s invoice running, to be finalized the day after the last day', async () => {
    const { tx, service } = setup();
    const ended = await service.end(CREATOR_ID, RUNNING_ID, PAY, NOW, ADMIN_ID);

    expect(tx.invoices.upsert).not.toHaveBeenCalled();
    expect(ended).toEqual({
      contractId: RUNNING_ID,
      invoiceStatus: 'running',
      lastDay: '2026-11-30',
      originalEndDate: '2026-12-15',
      invoice: 'pay',
      reasonMismatch: true,
      finalizableFrom: '2026-12-01',
      closing: [{ id: 'due-after', name: 'Evg_3', deadline: '2026-12-08' }],
      unfinished: [{ id: 'due-last-day', name: 'Evg_2', deadline: '2026-11-30' }],
      deletedPeriods: [
        { contractId: NEXT_ID, periodNumber: 3, startDate: '2026-12-16', endDate: '2027-03-15' },
      ],
      access: 'after_invoice_paid',
    });
  });

  // OWASP A09:2025: "Log Aktivitas" gets who ended what, from when to when, and why.
  it('records the end in the activity log on the same transaction', async () => {
    const { tx, audit, service } = setup();
    await service.end(CREATOR_ID, RUNNING_ID, PAY, NOW, ADMIN_ID);

    expect(audit.recordBy).toHaveBeenCalledExactlyOnceWith(tx, ADMIN_ID, {
      action: 'contract_ended_early',
      target: { id: RUNNING_ID, label: 'Rangga Pratama' },
      creatorId: CREATOR_ID,
      oldValues: { endDate: '2026-12-15' },
      newValues: {
        endDate: '2026-11-30',
        invoice: 'pay',
        reason: 'breach',
        closedContents: 1,
        deletedPeriods: [3],
      },
      note: 'Pelanggaran Kontrak · Konten diunggah ulang dari creator lain.',
    });
  });

  it('cancels the invoice today, creating its row when it has none, and logs both moves', async () => {
    const { tx, audit, service } = setup();
    const ended = await service.end(CREATOR_ID, RUNNING_ID, CANCEL, NOW, ADMIN_ID);

    expect(tx.invoices.upsert).toHaveBeenCalledExactlyOnceWith({
      where: { contract_id: RUNNING_ID },
      create: {
        contract_id: RUNNING_ID,
        status: 'cancelled',
        cancelled_at: NOW,
        cancelled_by: ADMIN_ID,
      },
      update: { status: 'cancelled', cancelled_at: NOW, cancelled_by: ADMIN_ID },
      select: { id: true },
    });
    expect(tx.contracts.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ end_date: day('2026-11-24'), end_reason: 'fraud' }),
      }),
    );
    expect(ended).toMatchObject({
      invoiceStatus: 'cancelled',
      lastDay: '2026-11-24',
      finalizableFrom: null,
      access: 'closed_now',
    });
    expect(audit.recordBy).toHaveBeenNthCalledWith(2, tx, ADMIN_ID, {
      action: 'invoice_cancelled',
      target: { id: 'invoice-2', label: 'Rangga Pratama · Periode 2' },
      creatorId: CREATOR_ID,
      oldValues: { status: 'running' },
      newValues: { status: 'cancelled' },
      note: 'Fraud · Konten diunggah ulang dari creator lain.',
    });
  });

  it('cancels an invoice that already has a running row', async () => {
    const { tx, service } = setup(periods({ running: { invoice: { status: 'running' } } }));
    await service.end(CREATOR_ID, RUNNING_ID, CANCEL, NOW, ADMIN_ID);
    expect(tx.invoices.upsert).toHaveBeenCalledOnce();
  });

  it('writes nothing it has nothing to write: no closing content, no waiting period', async () => {
    const setupResult = setup(periods({ next: null }));
    setupResult.tx.contents.findMany.mockResolvedValue([CONTENTS[0]]);

    await setupResult.service.end(CREATOR_ID, RUNNING_ID, PAY, NOW, ADMIN_ID);

    expect(setupResult.tx.contents.updateMany).not.toHaveBeenCalled();
    expect(setupResult.tx.contracts.deleteMany).not.toHaveBeenCalled();
    expect(setupResult.audit.recordBy).toHaveBeenCalledWith(
      setupResult.tx,
      ADMIN_ID,
      expect.objectContaining({
        newValues: expect.objectContaining({ closedContents: 0, deletedPeriods: [] }),
      }),
    );
  });

  it('works behind the development stand-in, which signs in no admin', async () => {
    const { tx, audit, service } = setup();
    await service.end(CREATOR_ID, RUNNING_ID, CANCEL, NOW, undefined);

    expect(tx.contracts.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ended_by: null }) }),
    );
    expect(tx.invoices.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ cancelled_by: null }) }),
    );
    expect(audit.recordBy).toHaveBeenCalledWith(tx, undefined, expect.anything());
  });

  it('answers "Kontrak sudah diakhiri" to the second admin, before judging the form', async () => {
    const setupResult = setup(
      periods({ running: { end_date: day('2026-11-30'), original_end_date: day('2026-12-15') } }),
    );

    const { error, body } = await refusal(
      setupResult.service.end(CREATOR_ID, RUNNING_ID, { invoice: 'refund' }, NOW, ADMIN_ID),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect(body).toEqual({ code: 'CONTRACT_ALREADY_ENDED', message: 'Kontrak sudah diakhiri' });
    expectNothingWritten(setupResult);
  });

  it('refuses a period that has not started', async () => {
    const setupResult = setup();
    const { body } = await refusal(
      setupResult.service.end(CREATOR_ID, NEXT_ID, PAY, NOW, ADMIN_ID),
    );
    expect(body).toEqual({ code: 'CONTRACT_NOT_STARTED', message: 'Kontrak belum dimulai' });
    expectNothingWritten(setupResult);
  });

  it('refuses an invalid form with a 422 and writes nothing', async () => {
    const setupResult = setup();
    const { error } = await refusal(
      setupResult.service.end(CREATOR_ID, RUNNING_ID, { ...PAY, note: '' }, NOW, ADMIN_ID),
    );
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expectNothingWritten(setupResult);
  });

  it('refuses to cancel an invoice whose amount is already frozen', async () => {
    const setupResult = setup(periods({ running: { invoice: { status: 'finalized' } } }));
    const { body } = await refusal(
      setupResult.service.end(CREATOR_ID, RUNNING_ID, CANCEL, NOW, ADMIN_ID),
    );
    expect(body).toEqual({ code: 'INVOICE_FINALIZED', message: 'Invoice sudah difinalisasi' });
    expectNothingWritten(setupResult);
  });

  it('answers a missing creator with a 404', async () => {
    const setupResult = setup(null);
    const { error, body } = await refusal(
      setupResult.service.end(CREATOR_ID, RUNNING_ID, PAY, NOW, ADMIN_ID),
    );
    expect(error).toBeInstanceOf(NotFoundException);
    expect(body).toEqual({ code: 'CREATOR_NOT_FOUND', message: 'Creator tidak ditemukan' });
    expectNothingWritten(setupResult);
  });

  // OWASP A01:2025: another creator's contract reads as missing, never as someone else's.
  it('answers a contract of another creator with the same 404 as a missing one', async () => {
    const setupResult = setup();
    const { error, body } = await refusal(
      setupResult.service.end(CREATOR_ID, '33333333-3333-4333-8333-333333333333', PAY, NOW, ADMIN_ID),
    );
    expect(error).toBeInstanceOf(NotFoundException);
    expect(body).toEqual({ code: 'PERIOD_NOT_FOUND', message: 'Periode tidak ditemukan' });
    expectNothingWritten(setupResult);
  });

  it('fails the end when the activity log cannot be written, so neither lands alone', async () => {
    const { audit, service } = setup();
    audit.recordBy.mockRejectedValue(new Error('audit down'));

    await expect(service.end(CREATOR_ID, RUNNING_ID, PAY, NOW, ADMIN_ID)).rejects.toThrow(
      'audit down',
    );
  });
});

describe('ContractEndService.preview', () => {
  it('plans the same consequences without a transaction, a lock or a write', async () => {
    const setupResult = setup();
    const plan = await setupResult.service.preview(CREATOR_ID, RUNNING_ID, PAY, NOW);

    expect(plan).toMatchObject({
      lastDay: '2026-11-30',
      closing: [{ id: 'due-after', name: 'Evg_3', deadline: '2026-12-08' }],
      deletedPeriods: [{ contractId: NEXT_ID, periodNumber: 3 }],
      access: 'after_invoice_paid',
    });
    expect(setupResult.prisma.$transaction).not.toHaveBeenCalled();
    expect(setupResult.tx.$queryRaw).not.toHaveBeenCalled();
    expectNothingWritten(setupResult);
  });

  it('refuses what the end would refuse', async () => {
    const setupResult = setup(
      periods({ running: { original_end_date: day('2026-12-15'), end_date: day('2026-11-30') } }),
    );
    const { body } = await refusal(setupResult.service.preview(CREATOR_ID, RUNNING_ID, PAY, NOW));
    expect(body).toEqual({ code: 'CONTRACT_ALREADY_ENDED', message: 'Kontrak sudah diakhiri' });
  });
});
