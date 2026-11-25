import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { joinName } from '../creators/evergreen.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { InvoiceSnapshotDto } from './dto/invoice-list.dto.js';
import { invoiceState } from './invoice-lifecycle.js';
import {
  renderInvoicePdf,
  renderReceiptPdf,
  type InvoicePdfData,
  type PdfInvoiceStatus,
} from './invoice-pdf.js';

// "Unduh Invoice" and "Unduh Receipt" (PBI-31, 31.2): an invoice's documents as files, for an
// admin (any invoice) or a creator (their own only, AC 6). Agreed 25 Nov 2026: the invoice once
// the creator acknowledged it, when no adjustment can change it any more (PBI-28 AC 11), and the
// receipt once the creator confirmed the payment arrived. The bytes are made on each request from
// the saved snapshot, so a file never drifts from the screen (AC 3).

const CONTRACT_SELECT = {
  id: true,
  creator_id: true,
  start_date: true,
  end_date: true,
  creators: {
    select: {
      first_name: true,
      middle_name: true,
      last_name: true,
      users: { select: { email: true } },
      // Every period in the order they started, to number this one as the screen does.
      contracts: {
        select: { id: true },
        orderBy: [{ start_date: 'asc' }, { id: 'asc' }],
      },
    },
  },
  invoice: {
    select: {
      status: true,
      snapshot: true,
      invoice_number: true,
      receipt_number: true,
      finalized_at: true,
      acknowledged_at: true,
      paid_at: true,
      payment_proof: { select: { uploaded_at: true } },
    },
  },
} satisfies Prisma.contractsSelect;

type ContractRow = Prisma.contractsGetPayload<{ select: typeof CONTRACT_SELECT }>;

/** The slice of the database client the PDF reads; tests hand in a stub of just that. */
export interface InvoicePdfClient {
  contracts: {
    findUnique(args: {
      where: { id: string };
      select: typeof CONTRACT_SELECT;
    }): Promise<ContractRow | null>;
  };
}

export type PdfDocument = 'invoice' | 'receipt';

export type PdfRenderers = Record<PdfDocument, (data: InvoicePdfData) => Promise<Buffer>>;

/** Nest token for renderers other than pdfkit's, which tests may hand in. */
export const INVOICE_PDF_RENDERERS = Symbol('INVOICE_PDF_RENDERERS');

const PDFKIT: PdfRenderers = { invoice: renderInvoicePdf, receipt: renderReceiptPdf };

/** Which invoice statuses each document exists for. */
const AVAILABLE: Record<PdfDocument, readonly string[]> = {
  invoice: ['creator_acked', 'payment_uploaded', 'paid'],
  receipt: ['paid'],
};

const UNAVAILABLE: Record<PdfDocument, { code: string; message: string }> = {
  invoice: {
    code: 'INVOICE_PDF_UNAVAILABLE',
    message: 'Invoice bisa diunduh setelah creator meng-acknowledge',
  },
  receipt: {
    code: 'RECEIPT_PDF_UNAVAILABLE',
    message: 'Receipt bisa diunduh setelah pembayaran dikonfirmasi creator',
  },
};

const FILE_PREFIX: Record<PdfDocument, string> = { invoice: 'Invoice', receipt: 'Receipt' };

export interface InvoicePdfFile {
  fileName: string;
  bytes: Buffer;
}

/**
 * Invoice_<NamaCreator>_Periode<N>.pdf, as the prototype names it (AC 5), and Receipt_ the same
 * way: the name with its spaces dropped, keeping letters, digits, dots, dashes and underscores
 * only, so no character can reach the header or a path. The header still encodes it (RFC 5987).
 */
export function invoicePdfFileName(
  document: PdfDocument,
  creatorName: string,
  periodNumber: number,
): string {
  const name = creatorName.replaceAll(/[^\p{L}\p{N}._-]/gu, '');
  return `${FILE_PREFIX[document]}_${name}_Periode${periodNumber}.pdf`;
}

function day(date: Date): string {
  return date.toISOString().slice(0, 10);
}

@Injectable()
export class InvoicePdfService {
  private readonly renderers: PdfRenderers;

  constructor(
    @Inject(PrismaService) private readonly prisma: InvoicePdfClient,
    @Optional() @Inject(INVOICE_PDF_RENDERERS) renderers?: PdfRenderers,
  ) {
    this.renderers = renderers ?? PDFKIT;
  }

  /** One of the invoice's documents; a creator passes their own id and may read only theirs. */
  async forContract(
    contractId: string,
    { creatorId }: { creatorId?: string },
    document: PdfDocument,
  ): Promise<InvoicePdfFile> {
    const contract = await this.prisma.contracts.findUnique({
      where: { id: contractId },
      select: CONTRACT_SELECT,
    });

    if (!contract) {
      throw new NotFoundException({
        code: 'INVOICE_NOT_FOUND',
        message: 'Invoice tidak ditemukan',
      });
    }
    if (creatorId !== undefined && contract.creator_id !== creatorId) {
      throw new ForbiddenException({
        code: 'INVOICE_FORBIDDEN',
        message: 'Kamu tidak punya akses ke invoice ini',
      });
    }

    const { invoice } = contract;
    if (
      !invoice ||
      !AVAILABLE[document].includes(invoice.status) ||
      !invoice.snapshot ||
      !invoice.invoice_number ||
      (document === 'receipt' && !invoice.receipt_number)
    ) {
      throw new ConflictException(UNAVAILABLE[document]);
    }

    const snapshot = invoice.snapshot as unknown as InvoiceSnapshotDto;
    const creatorName = joinName(contract.creators);
    const periodNumber =
      contract.creators.contracts.findIndex(({ id }) => id === contract.id) + 1;

    let bytes: Buffer;
    try {
      bytes = await this.renderers[document]({
        invoiceNumber: invoice.invoice_number,
        receiptNumber: invoice.receipt_number,
        creatorName,
        creatorEmail: contract.creators.users.email,
        periodNumber,
        periodStart: day(contract.start_date),
        periodEnd: day(contract.end_date),
        status: invoiceState(invoice.status).pipelineStatus as PdfInvoiceStatus,
        finalizedAt: invoice.finalized_at?.toISOString() ?? snapshot.finalizedAt,
        acknowledgedAt: invoice.acknowledged_at?.toISOString() ?? null,
        proofUploadedAt: invoice.payment_proof?.uploaded_at.toISOString() ?? null,
        paidAt: invoice.paid_at?.toISOString() ?? null,
        snapshot,
      });
    } catch {
      throw new InternalServerErrorException({
        code: 'INVOICE_PDF_FAILED',
        message: 'PDF gagal dibuat. Coba lagi.',
      });
    }

    return { fileName: invoicePdfFileName(document, creatorName, periodNumber), bytes };
  }
}
