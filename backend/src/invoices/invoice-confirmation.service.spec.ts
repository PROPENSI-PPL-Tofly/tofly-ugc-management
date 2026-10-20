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
    creators: { user_id: CREATOR_USER },
    invoice: status === null ? null : { status },
  };
}

function stubs(status: string | null = 'finalized') {
  const prisma = {
    contracts: { findUnique: vi.fn().mockResolvedValue(contract(status)) },
    invoices: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn(),
    },
  };
  const service = new InvoiceConfirmationService(
    prisma as unknown as InvoiceConfirmationClient,
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
          creators: { select: { user_id: true } },
          invoice: { select: { status: true } },
        },
      });
      // Guarded on the status it was read in, so a move made meanwhile is not overwritten.
      expect(prisma.invoices.updateMany).toHaveBeenCalledWith({
        where: { contract_id: CONTRACT, status: 'finalized' },
        data: {
          status: 'creator_acked',
          acknowledged_at: NOW,
          acknowledged_by: CREATOR_USER,
        },
      });
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
        data: { status: 'paid', paid_at: NOW, paid_by: CREATOR_USER },
      });
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
});
