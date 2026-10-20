import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { InvoiceCommentInput } from './comment-request.js';
import type {
  CommentAuthorRole,
  InvoiceCommentDto,
} from './dto/invoice-payment.dto.js';
import { creatorName } from './invoice-rows.js';

/** The database operations this service uses. */
export type InvoiceCommentsClient = Pick<
  PrismaService,
  'contracts' | 'invoices' | 'invoice_comments' | '$transaction'
>;

/**
 * Who writes, from the guard, never from the body. A creator is named by their creator id alone:
 * only the contract's own creator can write on it, so their user is read from the contract.
 */
export type CommentAuthor =
  { role: 'admin'; userId: string } | { role: 'creator'; creatorId: string };

/** Batched read of threads, for a listing that embeds them (13.1's GET /me/invoices). */
export interface InvoiceCommentReader {
  forContracts(
    contractIds: readonly string[],
  ): Promise<Map<string, InvoiceCommentDto[]>>;
}

const NAME_SELECT = {
  first_name: true,
  middle_name: true,
  last_name: true,
} as const;

const COMMENT_SELECT = {
  id: true,
  author_role: true,
  text: true,
  created_at: true,
} as const;

const OLDEST_FIRST = [{ created_at: 'asc' }, { id: 'asc' }] as const;

interface CommentRow {
  id: string;
  author_role: string;
  text: string;
  created_at: Date;
}

/**
 * Only the contract's own creator can write as a creator on it, so the creator's name comes from
 * the contract, not from the author's user row.
 */
function toDto(row: CommentRow, creator: string): InvoiceCommentDto {
  const authorRole = row.author_role as CommentAuthorRole;
  return {
    id: row.id,
    authorName: authorRole === 'admin' ? 'Admin' : creator,
    authorRole,
    text: row.text,
    createdAt: row.created_at.toISOString(),
  };
}

function invoiceNotFound(): NotFoundException {
  return new NotFoundException({
    code: 'INVOICE_NOT_FOUND',
    message: 'Invoice tidak ditemukan',
  });
}

/** An admin reaches every contract; a creator only their own. */
function scoped(contractId: string, creatorId: string | undefined) {
  return creatorId === undefined
    ? { id: contractId }
    : { id: contractId, creator_id: creatorId };
}

@Injectable()
export class InvoiceCommentsService implements InvoiceCommentReader {
  constructor(
    @Inject(PrismaService) private readonly prisma: InvoiceCommentsClient,
  ) {}

  /** The contract's thread in one query; a contract with no invoice row yet has none. */
  async list(
    contractId: string,
    { creatorId }: { creatorId?: string },
  ): Promise<InvoiceCommentDto[]> {
    const contract = await this.prisma.contracts.findFirst({
      where: scoped(contractId, creatorId),
      select: {
        id: true,
        creators: { select: NAME_SELECT },
        invoice: {
          select: {
            comments: { select: COMMENT_SELECT, orderBy: [...OLDEST_FIRST] },
          },
        },
      },
    });
    if (!contract) throw invoiceNotFound();

    const name = creatorName(contract.creators);
    return (contract.invoice?.comments ?? []).map((row) => toDto(row, name));
  }

  /**
   * Adds a comment at any stage. A contract nobody has adjusted yet gets its invoice row now,
   * as an adjustment would, in the same transaction as the comment, so a failure leaves neither.
   */
  async add(
    contractId: string,
    { text }: InvoiceCommentInput,
    author: CommentAuthor,
  ): Promise<InvoiceCommentDto> {
    const contract = await this.prisma.contracts.findFirst({
      where: scoped(
        contractId,
        author.role === 'creator' ? author.creatorId : undefined,
      ),
      select: {
        id: true,
        creators: { select: { ...NAME_SELECT, user_id: true } },
      },
    });
    if (!contract) throw invoiceNotFound();

    const saved = await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoices.upsert({
        where: { contract_id: contractId },
        create: { contract_id: contractId },
        update: {},
        select: { id: true },
      });

      return tx.invoice_comments.create({
        data: {
          invoice_id: invoice.id,
          author_user_id:
            author.role === 'admin' ? author.userId : contract.creators.user_id,
          author_role: author.role,
          text,
        },
        select: COMMENT_SELECT,
      });
    });

    return toDto(saved, creatorName(contract.creators));
  }

  async forContracts(
    contractIds: readonly string[],
  ): Promise<Map<string, InvoiceCommentDto[]>> {
    if (contractIds.length === 0) return new Map();

    const rows = await this.prisma.invoice_comments.findMany({
      where: { invoices: { contract_id: { in: [...contractIds] } } },
      select: {
        ...COMMENT_SELECT,
        invoices: {
          select: {
            contract_id: true,
            contracts: { select: { creators: { select: NAME_SELECT } } },
          },
        },
      },
      orderBy: [...OLDEST_FIRST],
    });

    const threads = new Map<string, InvoiceCommentDto[]>();
    for (const row of rows) {
      const { contract_id, contracts } = row.invoices;
      const thread = threads.get(contract_id) ?? [];
      thread.push(toDto(row, creatorName(contracts.creators)));
      threads.set(contract_id, thread);
    }
    return threads;
  }
}
