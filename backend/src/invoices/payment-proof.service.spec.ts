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
  return error as { getResponse(): unknown };
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
    it('stores the file, then records it and moves an acknowledged invoice on in one transaction', async () => {
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
      // The upload happens before the transaction, so no row lock is held while it runs.
      expect(store.put.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.$transaction.mock.invocationCallOrder[0],
      );
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'ReadCommitted',
      });
      // Guarded: moves the status only if it is still waiting for a proof.
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

    it('stores every upload under a fresh random key, never a name the admin typed', async () => {
      await new PaymentProofService(
        prisma as unknown as PaymentProofClient,
        store,
      ).upload(CONTRACT, PROOF, ADMIN);

      expect(store.put.mock.calls[0][0]).toMatch(
        /^payment-proofs\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    });

    it('refuses a contract that does not exist, storing nothing', async () => {
      prisma.contracts.findUnique.mockResolvedValue(null);

      const error = await refusalOf(service.upload(CONTRACT, PROOF, ADMIN));

      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.getResponse()).toEqual({
        code: 'INVOICE_NOT_FOUND',
        message: 'Invoice tidak ditemukan',
      });
      expect(store.put).not.toHaveBeenCalled();
    });

    it.each([
      ['an accruing contract with no invoice row yet', null],
      ['an invoice not acknowledged yet', { id: INVOICE, status: 'finalized' }],
      [
        'an invoice that already has its proof',
        { id: INVOICE, status: 'payment_uploaded' },
      ],
    ])('refuses %s, storing nothing', async (_case, invoice) => {
      prisma.contracts.findUnique.mockResolvedValue({ id: CONTRACT, invoice });

      const error = await refusalOf(service.upload(CONTRACT, PROOF, ADMIN));

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toEqual(NOT_AWAITING_PROOF);
      expect(store.put).not.toHaveBeenCalled();
    });

    // OWASP Top 10:2025 A06 (Insecure Design) and A10 (Mishandling of Exceptional Conditions):
    // two admins at once, or a failure halfway, never leave a status without its proof or a
    // stored file nobody points at.
    it('loses a race to another upload as a conflict, and removes its own file', async () => {
      prisma.invoices.updateMany.mockResolvedValue({ count: 0 });

      const error = await refusalOf(service.upload(CONTRACT, PROOF, ADMIN));

      expect(error.getResponse()).toEqual(NOT_AWAITING_PROOF);
      expect(prisma.invoice_payment_proofs.create).not.toHaveBeenCalled();
      expect(store.remove).toHaveBeenCalledExactlyOnceWith(KEY);
    });

    it('reads a duplicate proof row (unique invoice) as the same conflict, and removes its file', async () => {
      prisma.invoice_payment_proofs.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      const error = await refusalOf(service.upload(CONTRACT, PROOF, ADMIN));

      expect(error).toBeInstanceOf(ConflictException);
      expect(store.remove).toHaveBeenCalledExactlyOnceWith(KEY);
    });

    it('passes on any other failure after storing, keeping it over a failed clean-up, which is logged', async () => {
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

    it('answers a storage outage as unavailable, recording nothing', async () => {
      store.put.mockRejectedValue(new Error('503 from storage'));

      const error = await refusalOf(service.upload(CONTRACT, PROOF, ADMIN));

      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect(error.getResponse()).toEqual({
        code: 'PROOF_STORAGE_UNAVAILABLE',
        message: 'Bukti pembayaran gagal disimpan. Coba lagi.',
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('open', () => {
    const SAVED = {
      object_key: OBJECT,
      file_name: 'transfer-agustus.pdf',
      content_type: 'application/pdf',
    };
    const SELECT = { object_key: true, file_name: true, content_type: true };

    it("opens any invoice's proof for an admin, named and typed as saved", async () => {
      prisma.invoice_payment_proofs.findFirst.mockResolvedValue(SAVED);
      store.open.mockResolvedValue({ kind: 'redirect', url: 'https://signed' });

      await expect(service.open(CONTRACT, {})).resolves.toEqual({
        kind: 'redirect',
        url: 'https://signed',
      });
      expect(prisma.invoice_payment_proofs.findFirst).toHaveBeenCalledWith({
        where: { invoices: { contract_id: CONTRACT } },
        select: SELECT,
      });
      expect(store.open).toHaveBeenCalledWith(KEY, {
        fileName: 'transfer-agustus.pdf',
        contentType: 'application/pdf',
      });
    });

    // OWASP Top 10:2025 A01 (Broken Access Control): a creator's lookup is scoped to their own
    // contracts, and another creator's proof answers exactly as a missing one.
    it("looks a creator's proof up only among their own contracts, answering not found otherwise", async () => {
      prisma.invoice_payment_proofs.findFirst.mockResolvedValue(null);

      const error = await refusalOf(
        service.open(CONTRACT, { creatorId: CREATOR }),
      );

      expect(prisma.invoice_payment_proofs.findFirst).toHaveBeenCalledWith({
        where: {
          invoices: {
            contract_id: CONTRACT,
            contracts: { creator_id: CREATOR },
          },
        },
        select: SELECT,
      });
      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.getResponse()).toEqual({
        code: 'PROOF_NOT_FOUND',
        message: 'Bukti pembayaran tidak ditemukan',
      });
      expect(store.open).not.toHaveBeenCalled();
    });

    it('still opens a creator their own proof through that scope', async () => {
      prisma.invoice_payment_proofs.findFirst.mockResolvedValue(SAVED);
      store.open.mockResolvedValue({ kind: 'redirect', url: 'https://signed' });

      await expect(
        service.open(CONTRACT, { creatorId: CREATOR }),
      ).resolves.toEqual({
        kind: 'redirect',
        url: 'https://signed',
      });
    });

    it('answers a recorded proof whose file is gone as not found, not as a crash', async () => {
      prisma.invoice_payment_proofs.findFirst.mockResolvedValue(SAVED);
      store.open.mockResolvedValue(null);

      expect(await refusalOf(service.open(CONTRACT, {}))).toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('forContracts', () => {
    it("reads every asked contract's proof in one query, linked for each audience", async () => {
      prisma.invoice_payment_proofs.findMany.mockResolvedValue([
        {
          file_name: 'a.pdf',
          uploaded_at: UPLOADED_AT,
          invoices: { contract_id: CONTRACT },
        },
      ]);

      const forCreator = await service.forContracts(
        [CONTRACT, OTHER_CONTRACT],
        'creator',
      );
      const forAdmin = await service.forContracts([CONTRACT], 'admin');

      expect(prisma.invoice_payment_proofs.findMany).toHaveBeenNthCalledWith(
        1,
        {
          where: {
            invoices: { contract_id: { in: [CONTRACT, OTHER_CONTRACT] } },
          },
          select: {
            file_name: true,
            uploaded_at: true,
            invoices: { select: { contract_id: true } },
          },
        },
      );
      expect(forCreator).toEqual(
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
      expect(forAdmin.get(CONTRACT)?.url).toBe(
        `/api/invoices/${CONTRACT}/payment-proof`,
      );
    });

    it('asks nothing for an empty page', async () => {
      await expect(service.forContracts([], 'admin')).resolves.toEqual(
        new Map(),
      );
      expect(prisma.invoice_payment_proofs.findMany).not.toHaveBeenCalled();
    });
  });
});
