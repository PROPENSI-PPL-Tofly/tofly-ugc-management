import {
  ConflictException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { FileStore } from '../storage/file-store.js';
import type { CheckedProof } from './payment-proof-file.js';
import {
  PaymentProofService,
  type PaymentProofClient,
} from './payment-proof.service.js';

const CONTRACT = '11111111-1111-4111-8111-111111111111';
const OTHER_CONTRACT = '22222222-2222-4222-8222-222222222222';
const INVOICE = '33333333-3333-4333-8333-333333333333';
const ADMIN = '44444444-4444-4444-8444-444444444444';
const CREATOR = '55555555-5555-4555-8555-555555555555';
const OBJECT = '66666666-6666-4666-8666-666666666666';
const KEY = `payment-proofs/${OBJECT}`;
const UPLOADED_AT = new Date('2026-10-20T03:00:00.000Z');

const PROOF: CheckedProof = {
  bytes: Buffer.from('%PDF-1.7'),
  contentType: 'application/pdf',
  fileName: 'transfer-agustus.pdf',
};

const NOT_AWAITING_PROOF = {
  code: 'INVOICE_NOT_AWAITING_PROOF',
  message:
    'Bukti pembayaran hanya bisa diunggah setelah creator meng-acknowledge invoice',
};

function stubs() {
  const prisma = {
    contracts: { findUnique: vi.fn() },
    invoices: { updateMany: vi.fn() },
    invoice_payment_proofs: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    // The transaction client is the same stub, so each test reads what ran inside it.
    $transaction: vi.fn(),
  };
  prisma.contracts.findUnique.mockResolvedValue({
    id: CONTRACT,
    invoice: { id: INVOICE, status: 'creator_acked' },
  });
  prisma.invoices.updateMany.mockResolvedValue({ count: 1 });
  prisma.invoice_payment_proofs.create.mockResolvedValue({
    file_name: PROOF.fileName,
    uploaded_at: UPLOADED_AT,
  });
  prisma.invoice_payment_proofs.findMany.mockResolvedValue([]);
  prisma.$transaction.mockImplementation(
    (work: (tx: typeof prisma) => Promise<unknown>) => work(prisma),
  );

  const store = {
    put: vi.fn<FileStore['put']>().mockResolvedValue(undefined),
    open: vi.fn<FileStore['open']>(),
    remove: vi.fn<FileStore['remove']>().mockResolvedValue(undefined),
  };

  const service = new PaymentProofService(
    prisma as unknown as PaymentProofClient,
    store,
    () => OBJECT,
  );
  return { prisma, store, service };
}

async function refusalOf(work: Promise<unknown>) {
  const error = await work.then(
    () => expect.unreachable('the call must be refused'),
    (thrown: unknown) => thrown,
  );
  return error as { getResponse(): unknown; getStatus(): number };
}

describe('PaymentProofService', () => {
  let prisma: ReturnType<typeof stubs>['prisma'];
  let store: ReturnType<typeof stubs>['store'];
  let service: PaymentProofService;

  beforeEach(() => {
    ({ prisma, store, service } = stubs());
  });

  it('is injected with the Prisma client, which runs every query it needs', () => {
    expectTypeOf<PrismaService>().toExtend<PaymentProofClient>();
  });

  describe('upload', () => {
    describe('accepts', () => {
      it('a proof once the creator has acknowledged: stores it, records it and moves the invoice on', async () => {
        await expect(service.upload(CONTRACT, PROOF, ADMIN)).resolves.toEqual({
          fileName: 'transfer-agustus.pdf',
          url: `/api/invoices/${CONTRACT}/payment-proof`,
          uploadedAt: '2026-10-20T03:00:00.000Z',
          invoiceStatus: 'payment_uploaded',
        });

        expect(store.put).toHaveBeenCalledExactlyOnceWith(
          KEY,
          PROOF.bytes,
          'application/pdf',
        );
        expect(prisma.invoices.updateMany).toHaveBeenCalledWith({
          where: { id: INVOICE, status: 'creator_acked' },
          data: { status: 'payment_uploaded' },
        });
        expect(prisma.invoice_payment_proofs.create).toHaveBeenCalledWith({
          data: {
            invoice_id: INVOICE,
            object_key: OBJECT,
            file_name: 'transfer-agustus.pdf',
            content_type: 'application/pdf',
            size_bytes: PROOF.bytes.length,
            uploaded_by: ADMIN,
          },
          select: { file_name: true, uploaded_at: true },
        });
        expect(store.remove).not.toHaveBeenCalled();
      });

      it('stores the file before the transaction, so the transaction holds no lock during the upload', async () => {
        await service.upload(CONTRACT, PROOF, ADMIN);

        expect(store.put.mock.invocationCallOrder[0]).toBeLessThan(
          prisma.$transaction.mock.invocationCallOrder[0],
        );
      });

      it('names a new random key for every upload', async () => {
        const real = new PaymentProofService(
          prisma as unknown as PaymentProofClient,
          store,
        );

        await real.upload(CONTRACT, PROOF, ADMIN);

        expect(store.put.mock.calls[0][0]).toMatch(
          /^payment-proofs\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        );
      });
    });

    describe('refuses', () => {
      it('a contract that does not exist, before storing anything', async () => {
        prisma.contracts.findUnique.mockResolvedValue(null);

        const error = await refusalOf(service.upload(CONTRACT, PROOF, ADMIN));

        expect(error).toBeInstanceOf(NotFoundException);
        expect(error.getResponse()).toEqual({
          code: 'INVOICE_NOT_FOUND',
          message: 'Invoice tidak ditemukan',
        });
        expect(store.put).not.toHaveBeenCalled();
      });

      it('an accruing contract with no invoice row yet', async () => {
        prisma.contracts.findUnique.mockResolvedValue({
          id: CONTRACT,
          invoice: null,
        });

        const error = await refusalOf(service.upload(CONTRACT, PROOF, ADMIN));

        expect(error).toBeInstanceOf(ConflictException);
        expect(error.getResponse()).toEqual(NOT_AWAITING_PROOF);
        expect(store.put).not.toHaveBeenCalled();
      });

      it.each(['running', 'finalized', 'payment_uploaded', 'paid'])(
        'an invoice that is %s, before storing anything',
        async (status) => {
          prisma.contracts.findUnique.mockResolvedValue({
            id: CONTRACT,
            invoice: { id: INVOICE, status },
          });

          const error = await refusalOf(service.upload(CONTRACT, PROOF, ADMIN));

          expect(error.getResponse()).toEqual(NOT_AWAITING_PROOF);
          expect(store.put).not.toHaveBeenCalled();
          expect(prisma.$transaction).not.toHaveBeenCalled();
        },
      );
    });

    // OWASP Top 10:2025 A06 (Insecure Design) and A10 (Mishandling of Exceptional Conditions):
    // two admins at once, or a failure halfway, never leave a status without its proof or a
    // stored file nobody points at.
    describe('edge:', () => {
      it('loses a race when the status moved after the check, and removes its file', async () => {
        prisma.invoices.updateMany.mockResolvedValue({ count: 0 });

        const error = await refusalOf(service.upload(CONTRACT, PROOF, ADMIN));

        expect(error.getResponse()).toEqual(NOT_AWAITING_PROOF);
        expect(prisma.invoice_payment_proofs.create).not.toHaveBeenCalled();
        expect(store.remove).toHaveBeenCalledExactlyOnceWith(KEY);
      });

      it('reads a proof already saved for the invoice as the same conflict, and removes its file', async () => {
        prisma.invoice_payment_proofs.create.mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
            code: 'P2002',
            clientVersion: 'test',
          }),
        );

        const error = await refusalOf(service.upload(CONTRACT, PROOF, ADMIN));

        expect(error).toBeInstanceOf(ConflictException);
        expect(error.getResponse()).toEqual(NOT_AWAITING_PROOF);
        expect(store.remove).toHaveBeenCalledExactlyOnceWith(KEY);
      });

      it('passes on any other database failure, and removes its file', async () => {
        const failure = new Prisma.PrismaClientKnownRequestError('FK', {
          code: 'P2003',
          clientVersion: 'test',
        });
        prisma.invoice_payment_proofs.create.mockRejectedValue(failure);

        await expect(service.upload(CONTRACT, PROOF, ADMIN)).rejects.toBe(
          failure,
        );
        expect(store.remove).toHaveBeenCalledExactlyOnceWith(KEY);
      });

      it('keeps the first failure when removing the file fails too, and logs the leftover key', async () => {
        const failure = new Error('connection reset');
        prisma.$transaction.mockRejectedValue(failure);
        store.remove.mockRejectedValue(new Error('bucket unreachable'));
        const log = vi
          .spyOn(Logger.prototype, 'error')
          .mockImplementation(() => {});

        await expect(service.upload(CONTRACT, PROOF, ADMIN)).rejects.toBe(
          failure,
        );
        expect(log).toHaveBeenCalledWith(
          `Could not remove the unrecorded payment proof ${KEY}: bucket unreachable`,
        );
        log.mockRestore();
      });

      it('answers a store that cannot take the file as unavailable, with nothing recorded', async () => {
        store.put.mockRejectedValue(new Error('503 from storage'));

        const error = await refusalOf(service.upload(CONTRACT, PROOF, ADMIN));

        expect(error).toBeInstanceOf(ServiceUnavailableException);
        expect(error.getResponse()).toEqual({
          code: 'PROOF_STORAGE_UNAVAILABLE',
          message: 'Bukti pembayaran gagal disimpan. Coba lagi.',
        });
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(store.remove).not.toHaveBeenCalled();
      });
    });
  });

  describe('open', () => {
    const SAVED = {
      object_key: OBJECT,
      file_name: 'transfer-agustus.pdf',
      content_type: 'application/pdf',
    };

    describe('accepts', () => {
      it("an admin's request for any invoice's proof", async () => {
        prisma.invoice_payment_proofs.findFirst.mockResolvedValue(SAVED);
        store.open.mockResolvedValue({
          kind: 'redirect',
          url: 'https://signed',
        });

        await expect(service.open(CONTRACT, {})).resolves.toEqual({
          kind: 'redirect',
          url: 'https://signed',
        });
        expect(prisma.invoice_payment_proofs.findFirst).toHaveBeenCalledWith({
          where: { invoices: { contract_id: CONTRACT } },
          select: { object_key: true, file_name: true, content_type: true },
        });
        expect(store.open).toHaveBeenCalledWith(KEY, {
          fileName: 'transfer-agustus.pdf',
          contentType: 'application/pdf',
        });
      });

      it("a creator's request, looked up only among their own contracts", async () => {
        prisma.invoice_payment_proofs.findFirst.mockResolvedValue(SAVED);
        store.open.mockResolvedValue({
          kind: 'redirect',
          url: 'https://signed',
        });

        await service.open(CONTRACT, { creatorId: CREATOR });

        expect(prisma.invoice_payment_proofs.findFirst).toHaveBeenCalledWith({
          where: {
            invoices: {
              contract_id: CONTRACT,
              contracts: { creator_id: CREATOR },
            },
          },
          select: { object_key: true, file_name: true, content_type: true },
        });
      });
    });

    // OWASP Top 10:2025 A01 (Broken Access Control): another creator's proof answers exactly as
    // a missing one does, so the endpoint never says whose contract an id is.
    describe('refuses', () => {
      it("a contract with no proof, or one that is not the creator's, as not found", async () => {
        prisma.invoice_payment_proofs.findFirst.mockResolvedValue(null);

        const error = await refusalOf(
          service.open(CONTRACT, { creatorId: CREATOR }),
        );

        expect(error).toBeInstanceOf(NotFoundException);
        expect(error.getResponse()).toEqual({
          code: 'PROOF_NOT_FOUND',
          message: 'Bukti pembayaran tidak ditemukan',
        });
        expect(store.open).not.toHaveBeenCalled();
      });
    });

    describe('edge:', () => {
      it('answers a recorded proof whose file is gone as not found', async () => {
        prisma.invoice_payment_proofs.findFirst.mockResolvedValue(SAVED);
        store.open.mockResolvedValue(null);

        const error = await refusalOf(service.open(CONTRACT, {}));

        expect(error.getStatus()).toBe(404);
      });
    });
  });

  describe('forContracts', () => {
    it("reads every asked contract's proof in one query, linked for the audience", async () => {
      prisma.invoice_payment_proofs.findMany.mockResolvedValue([
        {
          file_name: 'a.pdf',
          uploaded_at: UPLOADED_AT,
          invoices: { contract_id: CONTRACT },
        },
      ]);

      const proofs = await service.forContracts(
        [CONTRACT, OTHER_CONTRACT],
        'creator',
      );

      expect(
        prisma.invoice_payment_proofs.findMany,
      ).toHaveBeenCalledExactlyOnceWith({
        where: {
          invoices: { contract_id: { in: [CONTRACT, OTHER_CONTRACT] } },
        },
        select: {
          file_name: true,
          uploaded_at: true,
          invoices: { select: { contract_id: true } },
        },
      });
      expect(proofs).toEqual(
        new Map([
          [
            CONTRACT,
            {
              fileName: 'a.pdf',
              url: `/api/me/invoices/${CONTRACT}/payment-proof`,
              uploadedAt: '2026-10-20T03:00:00.000Z',
            },
          ],
        ]),
      );
      expect(proofs.has(OTHER_CONTRACT)).toBe(false);
    });

    it("links an admin's proofs to the admin route", async () => {
      prisma.invoice_payment_proofs.findMany.mockResolvedValue([
        {
          file_name: 'a.pdf',
          uploaded_at: UPLOADED_AT,
          invoices: { contract_id: CONTRACT },
        },
      ]);

      const proofs = await service.forContracts([CONTRACT], 'admin');

      expect(proofs.get(CONTRACT)?.url).toBe(
        `/api/invoices/${CONTRACT}/payment-proof`,
      );
    });

    it('asks nothing for no contracts', async () => {
      await expect(service.forContracts([], 'admin')).resolves.toEqual(
        new Map(),
      );
      expect(prisma.invoice_payment_proofs.findMany).not.toHaveBeenCalled();
    });
  });
});
