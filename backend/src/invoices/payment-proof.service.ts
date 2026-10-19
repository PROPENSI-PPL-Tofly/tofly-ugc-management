import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  FILE_STORE,
  type FileStore,
  type OpenedFile,
} from '../storage/file-store.js';
import { invoiceState, notAwaitingProof } from './invoice-lifecycle.js';
import type { CheckedProof } from './payment-proof-file.js';

/** The database operations this service uses. */
export type PaymentProofClient = Pick<
  PrismaService,
  'contracts' | 'invoices' | 'invoice_payment_proofs' | '$transaction'
>;

/** Who is asking: an admin sees every proof, a creator only their own contracts' ones. */
export type ProofAudience = 'admin' | 'creator';

/** A saved proof as the API answers it. */
export interface PaymentProofDto {
  fileName: string;
  /** A stable same-origin link; the backend checks access and opens the file only when followed. */
  url: string;
  /** ISO instant. */
  uploadedAt: string;
}

export interface UploadedPaymentProofDto extends PaymentProofDto {
  invoiceStatus: 'payment_uploaded';
}

/** Batched read of proofs, for every listing that shows them (13.1's GET /me/invoices too). */
export interface PaymentProofReader {
  forContracts(
    contractIds: readonly string[],
    audience: ProofAudience,
  ): Promise<Map<string, PaymentProofDto>>;
}

/** Every proof is stored under this prefix, then the UUID kept in object_key. */
const KEY_PREFIX = 'payment-proofs';

function keyOf(objectKey: string): string {
  return `${KEY_PREFIX}/${objectKey}`;
}

/** The link the browser follows, through the frontend's /api proxy. */
export function proofUrl(contractId: string, audience: ProofAudience): string {
  return audience === 'admin'
    ? `/api/invoices/${contractId}/payment-proof`
    : `/api/me/invoices/${contractId}/payment-proof`;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

@Injectable()
export class PaymentProofService implements PaymentProofReader {
  private readonly logger = new Logger(PaymentProofService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PaymentProofClient,
    @Inject(FILE_STORE) private readonly store: FileStore,
    private readonly newObjectKey: () => string = randomUUID,
  ) {}

  /**
   * Records the admin's proof and moves the invoice from creator_acked to payment_uploaded.
   * The file goes to the store first, outside the transaction, so no row lock is held while it
   * uploads; the transaction then records it and moves the status only if the invoice is still
   * waiting for a proof, and anything that fails after the upload removes the file again.
   */
  async upload(
    contractId: string,
    proof: CheckedProof,
    uploadedBy: string,
  ): Promise<UploadedPaymentProofDto> {
    const contract = await this.prisma.contracts.findUnique({
      where: { id: contractId },
      select: { id: true, invoice: { select: { id: true, status: true } } },
    });
    if (!contract) {
      throw new NotFoundException({
        code: 'INVOICE_NOT_FOUND',
        message: 'Invoice tidak ditemukan',
      });
    }
    // A contract nobody has adjusted or finalized has no row yet: it is still running.
    if (!contract.invoice) throw notAwaitingProof();
    invoiceState(contract.invoice.status).assertCanUploadProof();
    const invoiceId = contract.invoice.id;

    const objectKey = this.newObjectKey();
    const key = keyOf(objectKey);
    try {
      await this.store.put(key, proof.bytes, proof.contentType);
    } catch {
      throw new ServiceUnavailableException({
        code: 'PROOF_STORAGE_UNAVAILABLE',
        message: 'Bukti pembayaran gagal disimpan. Coba lagi.',
      });
    }

    try {
      const saved = await this.prisma.$transaction(
        async (tx) => {
          // The guarded update takes the invoice row's lock: a second upload waits, then finds
          // the status moved and changes nothing.
          const moved = await tx.invoices.updateMany({
            where: { id: invoiceId, status: 'creator_acked' },
            data: { status: 'payment_uploaded' },
          });
          if (moved.count !== 1) throw notAwaitingProof();

          return tx.invoice_payment_proofs.create({
            data: {
              invoice_id: invoiceId,
              object_key: objectKey,
              file_name: proof.fileName,
              content_type: proof.contentType,
              size_bytes: proof.bytes.length,
              uploaded_by: uploadedBy,
            },
            select: { file_name: true, uploaded_at: true },
          });
        },
        { isolationLevel: 'ReadCommitted' },
      );

      return {
        fileName: saved.file_name,
        url: proofUrl(contractId, 'admin'),
        uploadedAt: saved.uploaded_at.toISOString(),
        invoiceStatus: 'payment_uploaded',
      };
    } catch (error) {
      await this.removeUnrecorded(key);
      throw isUniqueViolation(error) ? notAwaitingProof() : error;
    }
  }

  /** Opens a proof for an admin (any invoice) or a creator (only their own contracts). */
  async open(
    contractId: string,
    { creatorId }: { creatorId?: string },
  ): Promise<OpenedFile> {
    const saved = await this.prisma.invoice_payment_proofs.findFirst({
      where: {
        invoices: {
          contract_id: contractId,
          ...(creatorId !== undefined && {
            contracts: { creator_id: creatorId },
          }),
        },
      },
      select: { object_key: true, file_name: true, content_type: true },
    });

    const opened =
      saved &&
      (await this.store.open(keyOf(saved.object_key), {
        fileName: saved.file_name,
        contentType: saved.content_type,
      }));

    if (!opened) {
      throw new NotFoundException({
        code: 'PROOF_NOT_FOUND',
        message: 'Bukti pembayaran tidak ditemukan',
      });
    }
    return opened;
  }

  async forContracts(
    contractIds: readonly string[],
    audience: ProofAudience,
  ): Promise<Map<string, PaymentProofDto>> {
    if (contractIds.length === 0) return new Map();

    // Only the columns shown: no object key, and never the file.
    const proofs = await this.prisma.invoice_payment_proofs.findMany({
      where: { invoices: { contract_id: { in: [...contractIds] } } },
      select: {
        file_name: true,
        uploaded_at: true,
        invoices: { select: { contract_id: true } },
      },
    });

    return new Map(
      proofs.map((proof) => [
        proof.invoices.contract_id,
        {
          fileName: proof.file_name,
          url: proofUrl(proof.invoices.contract_id, audience),
          uploadedAt: proof.uploaded_at.toISOString(),
        },
      ]),
    );
  }

  /** Best effort: the caller's own failure is what the request answers with. */
  private async removeUnrecorded(key: string): Promise<void> {
    try {
      await this.store.remove(key);
    } catch (error) {
      this.logger.error(
        `Could not remove the unrecorded payment proof ${key}: ${(error as Error).message}`,
      );
    }
  }
}
