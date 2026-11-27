import type { AdminNotifier } from '../email/admin-notifier.js';
import type { CreatorNotifier } from '../email/creator-notifier.js';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  InvoiceConfirmationService,
  type InvoiceConfirmationClient,
} from './invoice-confirmation.service.js';

const CONTRACT = '11111111-1111-4111-8111-111111111111';
const CREATOR = '22222222-2222-4222-8222-222222222222';
const OTHER_CREATOR = '33333333-3333-4333-8333-333333333333';
const CREATOR_USER = '44444444-4444-4444-8444-444444444444';
const INVOICE = '55555555-5555-4555-8555-555555555555';
const NOW = new Date('2026-10-20T05:30:00.000Z');

const NOT_FOUND = {
  code: 'INVOICE_NOT_FOUND',
  message: 'Invoice tidak ditemukan',
};
const ACCESS_DENIED = {
  code: 'INVOICE_ACCESS_DENIED',
  message: 'Akses ditolak',
};
const NOT_FINALIZED = {
  code: 'INVOICE_NOT_FINALIZED',
  message: 'Invoice belum difinalisasi',
};
const ALREADY_ACKNOWLEDGED = {
  code: 'INVOICE_ALREADY_ACKNOWLEDGED',
  message: 'Invoice sudah di-acknowledge',
};
const PROOF_NOT_UPLOADED = {
  code: 'PAYMENT_PROOF_NOT_UPLOADED',
  message: 'Bukti pembayaran belum diunggah',
};
const ALREADY_PAID = {
  code: 'INVOICE_ALREADY_PAID',
  message: 'Invoice sudah dibayar',
};

/** The contract as the service reads it: whose it is, and where its invoice stands. */
function contract(status: string | null, creatorId = CREATOR) {
  return {
    creator_id: creatorId,
    creators: {
      user_id: CREATOR_USER,
      first_name: 'Rangga',
      middle_name: null,
      last_name: 'Pratama',
    },
    invoice: status === null ? null : { id: INVOICE, status },
  };
}

function stubs(
  status: string | null = 'finalized',
  notifier?: Pick<CreatorNotifier, 'invoicePaid'>,
  admins?: Pick<AdminNotifier, 'invoiceAcknowledged'>,
) {
  const prisma = {
    contracts: { findUnique: vi.fn().mockResolvedValue(contract(status)) },
    invoices: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn(),
    },
    audit_logs: { create: vi.fn().mockResolvedValue({}) },
    // The month's document counter answers 7.
    $queryRaw: vi.fn().mockResolvedValue([{ last_number: 7 }]),
    // The transaction client is the same stub, so each test reads what ran inside it.
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation((work: (tx: typeof prisma) => Promise<unknown>) => work(prisma));
  const service = new InvoiceConfirmationService(
    prisma as unknown as InvoiceConfirmationClient,
    undefined,
    notifier,
    admins,
  );
  return { prisma, service };
}

async function refusalOf(work: Promise<unknown>) {
  const error = await work.then(
    () => expect.unreachable('the move must be refused'),
    (thrown: unknown) => thrown,
  );
  return {
    type: (error as object).constructor,
    body: (error as ConflictException).getResponse(),
  };
}

describe('InvoiceConfirmationService', () => {
  describe('acknowledge', () => {
    it("moves the creator's finalized invoice to acknowledged, keeping the creator's user and the moment", async () => {
      const { prisma, service } = stubs('finalized');

      await expect(
        service.acknowledge(CONTRACT, CREATOR, NOW),
      ).resolves.toEqual({
        invoiceStatus: 'creator_acked',
        acknowledgedAt: NOW.toISOString(),
      });

      expect(prisma.contracts.findUnique).toHaveBeenCalledWith({
        where: { id: CONTRACT },
        select: {
          creator_id: true,
          creators: {
            select: {
              user_id: true,
              first_name: true,
              middle_name: true,
              last_name: true,
            },
          },
          invoice: { select: { id: true, status: true } },
        },
      });
      // Guarded on the status it was read in, so a move made meanwhile is not overwritten.
      expect(prisma.invoices.updateMany).toHaveBeenCalledWith({
        where: { contract_id: CONTRACT, status: 'finalized' },
        data: {
          status: 'creator_acked',
          acknowledged_at: NOW,
          acknowledged_by: CREATOR_USER,
          // Issued now (PBI-31): the invoice number of the Jakarta month of the acknowledge.
          invoice_number: 'TOF-INV-202610-007',
        },
      });
      const counter = prisma.$queryRaw.mock.calls[0][0] as { values: unknown[] };
      expect(counter.values).toEqual(['invoice', '202610']);
    });

    // OWASP Top 10:2025 A08: the number is taken in the transaction that moves the invoice, so a
    // lost move rolls it back and leaves no gap.
    it('takes the number in the same transaction as the move, which a lost race rolls back', async () => {
      const { prisma, service } = stubs('finalized');
      prisma.invoices.updateMany.mockResolvedValue({ count: 0 });
      prisma.invoices.findUnique.mockResolvedValue({ status: 'creator_acked' });

      await refusalOf(service.acknowledge(CONTRACT, CREATOR, NOW));

      expect(prisma.$transaction).toHaveBeenCalledOnce();
      expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.invoices.updateMany.mock.invocationCallOrder[0],
      );
      await expect(prisma.$transaction.mock.results[0].value).rejects.toBeDefined();
    });

    it('is stamped with the current moment when none is given', async () => {
      const { prisma, service } = stubs('finalized');
      const before = Date.now();

      const { acknowledgedAt } = await service.acknowledge(CONTRACT, CREATOR);

      const stamped = Date.parse(acknowledgedAt);
      expect(stamped).toBeGreaterThanOrEqual(before);
      expect(stamped).toBeLessThanOrEqual(Date.now());
      expect(
        prisma.invoices.updateMany.mock.calls[0][0].data.acknowledged_at,
      ).toEqual(new Date(acknowledgedAt));
    });

    it('answers a contract that does not exist as not found, changing nothing', async () => {
      const { prisma, service } = stubs();
      prisma.contracts.findUnique.mockResolvedValue(null);

      expect(
        await refusalOf(service.acknowledge(CONTRACT, CREATOR, NOW)),
      ).toEqual({
        type: NotFoundException,
        body: NOT_FOUND,
      });
      expect(prisma.invoices.updateMany).not.toHaveBeenCalled();
    });

    // OWASP Top 10:2025 A01 (Broken Access Control): the creator id comes from the guard, and
    // another creator's invoice is refused before its status is even looked at.
    it('answers "Akses ditolak" on another creator\'s invoice, changing nothing', async () => {
      const { prisma, service } = stubs();
      prisma.contracts.findUnique.mockResolvedValue(
        contract('finalized', OTHER_CREATOR),
      );

      expect(
        await refusalOf(service.acknowledge(CONTRACT, CREATOR, NOW)),
      ).toEqual({
        type: ForbiddenException,
        body: ACCESS_DENIED,
      });
      expect(prisma.invoices.updateMany).not.toHaveBeenCalled();
    });

    it('refuses a contract nobody has finalized, which has no invoice row yet', async () => {
      const { prisma, service } = stubs(null);

      expect(
        await refusalOf(service.acknowledge(CONTRACT, CREATOR, NOW)),
      ).toEqual({
        type: ConflictException,
        body: NOT_FINALIZED,
      });
      expect(prisma.invoices.updateMany).not.toHaveBeenCalled();
    });

    it('refuses an invoice already acknowledged with that reason', async () => {
      const { prisma, service } = stubs('creator_acked');

      expect(
        (await refusalOf(service.acknowledge(CONTRACT, CREATOR, NOW))).body,
      ).toEqual(ALREADY_ACKNOWLEDGED);
      expect(prisma.invoices.updateMany).not.toHaveBeenCalled();
    });

    // OWASP Top 10:2025 A06 (Insecure Design): a second acknowledge racing the first finds the
    // status moved, changes nothing, and is told where the invoice now stands.
    it('answers a move lost to a concurrent one with where the invoice now stands', async () => {
      const { prisma, service } = stubs('finalized');
      prisma.invoices.updateMany.mockResolvedValue({ count: 0 });
      prisma.invoices.findUnique.mockResolvedValue({ status: 'creator_acked' });

      expect(
        (await refusalOf(service.acknowledge(CONTRACT, CREATOR, NOW))).body,
      ).toEqual(ALREADY_ACKNOWLEDGED);
      expect(prisma.invoices.findUnique).toHaveBeenCalledWith({
        where: { contract_id: CONTRACT },
        select: { status: true },
      });
    });

    it('reads an invoice row gone after a lost move as never finalized', async () => {
      const { prisma, service } = stubs('finalized');
      prisma.invoices.updateMany.mockResolvedValue({ count: 0 });
      prisma.invoices.findUnique.mockResolvedValue(null);

      expect(
        (await refusalOf(service.acknowledge(CONTRACT, CREATOR, NOW))).body,
      ).toEqual(NOT_FINALIZED);
    });

    // OWASP Top 10:2025 A10: a database failure is passed on as it is, never read as a lost move.
    it('passes on a failure of the transaction itself', async () => {
      const { prisma, service } = stubs('finalized');
      prisma.$queryRaw.mockRejectedValue(new Error('connection lost'));

      await expect(service.acknowledge(CONTRACT, CREATOR, NOW)).rejects.toThrow('connection lost');
      expect(prisma.invoices.findUnique).not.toHaveBeenCalled();
    });

    // OWASP Top 10:2025 A10 (Mishandling of Exceptional Conditions): a guarded update that
    // changed nothing never answers as a success, even when the reread still allows the move.
    it('fails closed when nothing changed although the invoice still allows the move', async () => {
      const { prisma, service } = stubs('finalized');
      prisma.invoices.updateMany.mockResolvedValue({ count: 0 });
      prisma.invoices.findUnique.mockResolvedValue({ status: 'finalized' });

      expect(
        await refusalOf(service.acknowledge(CONTRACT, CREATOR, NOW)),
      ).toEqual({
        type: ConflictException,
        body: {
          code: 'INVOICE_STATUS_CHANGED',
          message: 'Status invoice berubah. Muat ulang lalu coba lagi.',
        },
      });
    });
  });

  describe('confirmReceipt', () => {
    it("moves the creator's invoice with an uploaded proof to paid, keeping the creator's user and the moment", async () => {
      const { prisma, service } = stubs('payment_uploaded');

      await expect(
        service.confirmReceipt(CONTRACT, CREATOR, NOW),
      ).resolves.toEqual({ invoiceStatus: 'paid', paidAt: NOW.toISOString() });

      expect(prisma.invoices.updateMany).toHaveBeenCalledWith({
        where: { contract_id: CONTRACT, status: 'payment_uploaded' },
        data: {
          status: 'paid',
          paid_at: NOW,
          paid_by: CREATOR_USER,
          // Its receipt (PBI-31), numbered in the Jakarta month the payment was confirmed.
          receipt_number: 'TOF-RCP-202610-007',
        },
      });
      const counter = prisma.$queryRaw.mock.calls[0][0] as { values: unknown[] };
      expect(counter.values).toEqual(['receipt', '202610']);
    });

    it('is stamped with the current moment when none is given', async () => {
      const { service } = stubs('payment_uploaded');
      const before = Date.now();

      const { paidAt } = await service.confirmReceipt(CONTRACT, CREATOR);

      expect(Date.parse(paidAt)).toBeGreaterThanOrEqual(before);
      expect(Date.parse(paidAt)).toBeLessThanOrEqual(Date.now());
    });

    it('refuses before the proof is uploaded', async () => {
      const { prisma, service } = stubs('creator_acked');

      expect(
        (await refusalOf(service.confirmReceipt(CONTRACT, CREATOR, NOW))).body,
      ).toEqual(PROOF_NOT_UPLOADED);
      expect(prisma.invoices.updateMany).not.toHaveBeenCalled();
    });

    it('refuses a second confirmation once paid', async () => {
      const { service } = stubs('paid');

      expect(
        (await refusalOf(service.confirmReceipt(CONTRACT, CREATOR, NOW))).body,
      ).toEqual(ALREADY_PAID);
    });

    it('answers "Akses ditolak" on another creator\'s invoice', async () => {
      const { prisma, service } = stubs();
      prisma.contracts.findUnique.mockResolvedValue(
        contract('payment_uploaded', OTHER_CREATOR),
      );

      expect(
        (await refusalOf(service.confirmReceipt(CONTRACT, CREATOR, NOW))).body,
      ).toEqual(ACCESS_DENIED);
      expect(prisma.invoices.updateMany).not.toHaveBeenCalled();
    });

    it('answers a confirmation lost to a concurrent one as already paid', async () => {
      const { prisma, service } = stubs('payment_uploaded');
      prisma.invoices.updateMany.mockResolvedValue({ count: 0 });
      prisma.invoices.findUnique.mockResolvedValue({ status: 'paid' });

      expect(
        (await refusalOf(service.confirmReceipt(CONTRACT, CREATOR, NOW))).body,
      ).toEqual(ALREADY_PAID);
    });
  });

  // PBI-23 (SCRUM-295): "Invoice & Pembayaran" in Log Aktivitas (OWASP A09:2025).
  describe('Log Aktivitas', () => {
    const MOVES = [
      {
        name: 'acknowledge',
        from: 'finalized',
        to: 'creator_acked',
        action: 'invoice_acknowledged',
        act: (service: InvoiceConfirmationService) =>
          service.acknowledge(CONTRACT, CREATOR, NOW),
      },
      {
        name: 'confirmReceipt',
        from: 'payment_uploaded',
        to: 'paid',
        action: 'payment_confirmed',
        act: (service: InvoiceConfirmationService) =>
          service.confirmReceipt(CONTRACT, CREATOR, NOW),
      },
    ];

    it.each(MOVES)(
      '$name records the status change by the creator, in one transaction with the move',
      async ({ from, to, action, act }) => {
        const { prisma, service } = stubs(from);

        await act(service);

        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(prisma.audit_logs.create).toHaveBeenCalledExactlyOnceWith({
          data: {
            actor_user_id: CREATOR_USER,
            actor_name: 'Rangga Pratama',
            actor_role: 'creator',
            category: 'invoice_pembayaran',
            action,
            target_type: 'invoice',
            target_id: INVOICE,
            target_label: 'Invoice Rangga Pratama',
            creator_id: CREATOR,
            old_values: { status: from },
            new_values: { status: to },
            note: null,
          },
        });
        expect(
          prisma.audit_logs.create.mock.invocationCallOrder[0],
        ).toBeGreaterThan(prisma.invoices.updateMany.mock.invocationCallOrder[0]);
      },
    );

    it.each(MOVES)(
      '$name records nothing when a concurrent move got there first',
      async ({ from, to, act }) => {
        const { prisma, service } = stubs(from);
        prisma.invoices.updateMany.mockResolvedValue({ count: 0 });
        prisma.invoices.findUnique.mockResolvedValue({ status: to });

        await refusalOf(act(service));

        expect(prisma.audit_logs.create).not.toHaveBeenCalled();
      },
    );

    it.each(MOVES)(
      '$name fails when its entry cannot be written, so the move rolls back',
      async ({ from, act }) => {
        const { prisma, service } = stubs(from);
        const failure = new Error('log failed');
        prisma.audit_logs.create.mockRejectedValue(failure);

        await expect(act(service)).rejects.toBe(failure);
      },
    );
  });
});

// PBI-11 (11.2, AC 1 and AC 3): the creator's own Paid move still sends the Paid email, as Kania
// confirmed: it carries the receipt and the day access closes, which the screen does not.
describe('InvoiceConfirmationService, the Paid email', () => {
  function emails() {
    return { invoicePaid: vi.fn<CreatorNotifier['invoicePaid']>().mockResolvedValue() };
  }

  it('sends the Paid email once the confirmation is saved', async () => {
    const notifier = emails();
    const { prisma, service } = stubs('payment_uploaded', notifier);
    notifier.invoicePaid.mockImplementation(async () => {
      expect(prisma.invoices.updateMany).toHaveBeenCalled();
    });

    await service.confirmReceipt(CONTRACT, CREATOR, NOW);

    expect(notifier.invoicePaid).toHaveBeenCalledExactlyOnceWith({
      creatorId: CREATOR,
      contractId: CONTRACT,
      paidAt: NOW,
    });
  });

  it('sends nothing when the confirmation is refused', async () => {
    const notifier = emails();
    const { service } = stubs('creator_acked', notifier);

    await expect(service.confirmReceipt(CONTRACT, CREATOR, NOW)).rejects.toThrow();
    expect(notifier.invoicePaid).not.toHaveBeenCalled();
  });

  it('sends the creator nothing for their own acknowledgement', async () => {
    const notifier = emails();
    const { service } = stubs('finalized', notifier);

    await service.acknowledge(CONTRACT, CREATOR, NOW);

    expect(notifier.invoicePaid).not.toHaveBeenCalled();
  });
});

// PBI-11 (11.2, AC 5): every Admin hears the creator acknowledged, so the proof can be uploaded.
describe('InvoiceConfirmationService, the Admin email', () => {
  function admins() {
    return { invoiceAcknowledged: vi.fn<AdminNotifier['invoiceAcknowledged']>().mockResolvedValue() };
  }

  it('tells the Admins once the acknowledgement is saved', async () => {
    const notifier = admins();
    const { prisma, service } = stubs('finalized', undefined, notifier);
    notifier.invoiceAcknowledged.mockImplementation(async () => {
      expect(prisma.invoices.updateMany).toHaveBeenCalled();
    });

    await service.acknowledge(CONTRACT, CREATOR, NOW);

    expect(notifier.invoiceAcknowledged).toHaveBeenCalledExactlyOnceWith({ contractId: CONTRACT });
  });

  it('tells nobody when the acknowledgement is refused', async () => {
    const notifier = admins();
    const { service } = stubs('running', undefined, notifier);

    await expect(service.acknowledge(CONTRACT, CREATOR, NOW)).rejects.toThrow();
    expect(notifier.invoiceAcknowledged).not.toHaveBeenCalled();
  });

  it('tells the Admins nothing when the creator confirms Paid', async () => {
    const notifier = admins();
    const { service } = stubs('payment_uploaded', undefined, notifier);

    await service.confirmReceipt(CONTRACT, CREATOR, NOW);

    expect(notifier.invoiceAcknowledged).not.toHaveBeenCalled();
  });
});
