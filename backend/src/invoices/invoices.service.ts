import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Paging } from '../creators/paging.js';
import { jakartaDay } from '../creators/evergreen.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { hasInvoiceFilters, type InvoiceFilters } from './invoice-filters.js';
import type {
  InvoiceAdjustmentDto,
  InvoiceListResponse,
  InvoiceSnapshotDto,
} from './dto/invoice-list.dto.js';
import {
  CONTENT_SELECT,
  creatorName,
  INVOICE_SELECT,
  type InvoiceContentRow,
  type InvoiceContractRow,
  invoiceContractStatus,
  type InvoiceCreatorRow,
  pickContract,
  toInvoiceContent,
  toInvoiceContract,
  toInvoiceItem,
} from './invoice-rows.js';
import { invoiceState } from './invoice-lifecycle.js';
import type { ManualAdjustmentInput } from './manual-adjustment.js';
import { calculateInvoice } from './invoice-calculator.js';
import { RATE_FORMULA_SOURCE, type RateFormulaSource } from './rate-formula.js';

/** The database operations this service uses. */
export type InvoicesClient = Pick<
  PrismaService,
  | 'creators'
  | 'contents'
  | 'contracts'
  | 'invoices'
  | 'invoice_adjustments'
  | '$queryRaw'
  | '$transaction'
>;

/** What the controller needs from the invoice service. */
export interface InvoiceLister {
  list(
    paging: Paging,
    today?: Date,
    filters?: InvoiceFilters,
  ): Promise<InvoiceListResponse>;
  addAdjustment(
    contractId: string,
    input: ManualAdjustmentInput,
    actorUserId: string,
  ): Promise<InvoiceAdjustmentDto & { invoiceStatus: 'running' }>;
  finalize(contractId: string, today?: Date): Promise<{
    invoiceStatus: 'finalized';
    adjustments: InvoiceAdjustmentDto[];
    snapshot: InvoiceSnapshotDto;
  }>;
}

/** A creator without any contract has nothing to invoice, so the table never lists them. */
const HAS_CONTRACT = {
  contracts: { some: {} },
} satisfies Prisma.creatorsWhereInput;

const ORDER_BY: Prisma.creatorsOrderByWithRelationInput[] = [
  { first_name: 'asc' },
  { last_name: 'asc' },
  { id: 'asc' },
];

/** A creator with the contract the table describes for them. */
interface PickedCreator {
  row: InvoiceCreatorRow;
  contract: InvoiceContractRow;
}

/** One page of the listing before its content is loaded. */
interface PickedPage {
  picked: PickedCreator[];
  page: number;
  total: number;
  totalPages: number;
}

function pick(rows: InvoiceCreatorRow[], today: Date): PickedCreator[] {
  return rows.flatMap((row) => {
    const contract = pickContract(row, today);
    return contract ? [{ row, contract }] : [];
  });
}

/** Whether a creator passes the table's filters: their name, and their contract's status. */
function matches(
  { row, contract }: PickedCreator,
  filters: InvoiceFilters,
  today: Date,
): boolean {
  if (
    filters.q &&
    !creatorName(row).toLowerCase().includes(filters.q.toLowerCase())
  ) {
    return false;
  }
  return (
    !filters.contract ||
    invoiceContractStatus(contract, today) === filters.contract
  );
}

/** The last page for a page past it, so the table needs no second request. */
function clampPage(asked: number, pageSize: number, total: number) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return { page: Math.min(asked, totalPages), totalPages };
}

/**
 * Loads one page of creators, then the content of the one contract per creator the table
 * describes, and leaves the arithmetic to invoice-rows and the calculator. The formula comes
 * through RateFormulaSource.
 *
 * Without filters the page is cut in the database. A filter reads the contract's status,
 * which is worked out from its dates rather than stored, so with one the creators and their
 * contracts (no content) are read whole, filtered and paged here, the way the Creator
 * Database filters; content is still loaded for the page alone.
 */

const INVOICE_ADJUSTMENT_SELECT = {
  id: true,
  amount: true,
  reason: true,
  actor_user_id: true,
  created_at: true,
} satisfies Prisma.invoice_adjustmentsSelect;

function adjustmentDto(row: {
  id: string;
  amount: Prisma.Decimal;
  reason: string;
  actor_user_id: string;
  created_at: Date;
}): InvoiceAdjustmentDto {
  return {
    id: row.id,
    amount: row.amount.toNumber(),
    reason: row.reason,
    actorId: row.actor_user_id,
    createdAt: row.created_at.toISOString(),
  };
}

function codeError(code: string, message: string): ConflictException {
  return new ConflictException({ code, message });
}

/** Loads lifecycle data for the selected page and leaves invoice arithmetic to the calculator. */
@Injectable()
export class InvoicesService implements InvoiceLister {
  constructor(
    @Inject(PrismaService) private readonly prisma: InvoicesClient,
    @Inject(RATE_FORMULA_SOURCE) private readonly formulas: RateFormulaSource,
  ) {}

  async list(
    { page: asked, pageSize }: Paging,
    today = new Date(),
    filters: InvoiceFilters = {},
  ): Promise<InvoiceListResponse> {
    const [{ picked, page, total, totalPages }, formula] = await Promise.all([
      hasInvoiceFilters(filters)
        ? this.filteredPage(asked, pageSize, today, filters)
        : this.page(asked, pageSize, today),
      this.formulas.current(),
    ]);
    const [contents, persisted] = await Promise.all([
      this.prisma.contents.findMany({
        where: { contract_id: { in: picked.map(({ contract }) => contract.id) } },
        select: CONTENT_SELECT,
        orderBy: { deadline: 'asc' },
      }),
      picked.length === 0
        ? Promise.resolve([])
        : this.prisma.invoices.findMany({
            where: { contract_id: { in: picked.map(({ contract }) => contract.id) } },
            select: {
              contract_id: true,
              status: true,
              snapshot: true,
              adjustments: {
                select: INVOICE_ADJUSTMENT_SELECT,
                orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
              },
            },
          }),
    ]);
    const byContract = new Map<string, InvoiceContentRow[]>();
    for (const content of contents) {
      const list = byContract.get(content.contract_id) ?? [];
      list.push(content);
      byContract.set(content.contract_id, list);
    }
    const lifecycleByContract = new Map<
      string,
      {
        status: 'running' | 'finalized';
        adjustments: InvoiceAdjustmentDto[];
        snapshot: InvoiceSnapshotDto | null;
      }
    >();
    for (const invoice of persisted) {
      lifecycleByContract.set(invoice.contract_id, {
        status: invoice.status,
        adjustments: invoice.adjustments.map(adjustmentDto),
        snapshot: invoice.snapshot as unknown as InvoiceSnapshotDto | null,
      });
    }

    return {
      items: picked.map(({ row, contract }) =>
        toInvoiceItem(
          row,
          contract,
          byContract.get(contract.id) ?? [],
          formula,
          today,
          lifecycleByContract.get(contract.id) ?? {
            status: 'running',
            adjustments: [],
            snapshot: null,
          },
        ),
      ),
      page,
      pageSize,
      total,
      totalPages,
    };
  }

  private async page(
    asked: number,
    pageSize: number,
    today: Date,
  ): Promise<PickedPage> {
    const total = await this.prisma.creators.count({ where: HAS_CONTRACT });
    const { page, totalPages } = clampPage(asked, pageSize, total);
    const rows = await this.prisma.creators.findMany({
      where: HAS_CONTRACT,
      select: INVOICE_SELECT,
      orderBy: ORDER_BY,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { picked: pick(rows, today), page, total, totalPages };
  }

  private async filteredPage(
    asked: number,
    pageSize: number,
    today: Date,
    filters: InvoiceFilters,
  ): Promise<PickedPage> {
    const rows = await this.prisma.creators.findMany({
      where: HAS_CONTRACT,
      select: INVOICE_SELECT,
      orderBy: ORDER_BY,
    });
    const matched = pick(rows, today).filter((creator) =>
      matches(creator, filters, today),
    );
    const { page, totalPages } = clampPage(asked, pageSize, matched.length);
    return {
      picked: matched.slice((page - 1) * pageSize, page * pageSize),
      page,
      total: matched.length,
      totalPages,
    };
  }

  async addAdjustment(
    contractId: string,
    input: ManualAdjustmentInput,
    actorUserId: string,
  ): Promise<InvoiceAdjustmentDto & { invoiceStatus: 'running' }> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockContract(tx, contractId);
      await this.requireContract(tx, contractId);
      const invoice = await tx.invoices.upsert({
        where: { contract_id: contractId },
        create: { contract_id: contractId },
        update: {},
        select: { id: true, status: true },
      });
      invoiceState(invoice.status).assertCanAdjust();

      const saved = await tx.invoice_adjustments.create({
        data: {
          invoice_id: invoice.id,
          amount: new Prisma.Decimal(input.amount.toFixed(2)),
          reason: input.reason,
          actor_user_id: actorUserId,
        },
        select: INVOICE_ADJUSTMENT_SELECT,
      });
      return { ...adjustmentDto(saved), invoiceStatus: 'running' };
    }, { isolationLevel: 'ReadCommitted' });
  }

  async finalize(
    contractId: string,
    today = new Date(),
  ): Promise<{
    invoiceStatus: 'finalized';
    adjustments: InvoiceAdjustmentDto[];
    snapshot: InvoiceSnapshotDto;
  }> {
    const formula = await this.formulas.current();
    return this.prisma.$transaction(async (tx) => {
      await this.lockContract(tx, contractId);
      const contract = await tx.contracts.findUnique({
        where: { id: contractId },
        select: {
          id: true,
          start_date: true,
          end_date: true,
          content_quota: true,
          fixed_rate: true,
          creators: { select: { access_revoke_date: true } },
          contents: { select: CONTENT_SELECT, orderBy: { deadline: 'asc' } },
        },
      });
      if (!contract) this.contractNotFound();

      if (jakartaDay(today) <= contract.end_date.toISOString().slice(0, 10)) {
        throw codeError('CONTRACT_NOT_ENDED', 'Kontrak belum berakhir');
      }

      const invoice = await tx.invoices.upsert({
        where: { contract_id: contractId },
        create: { contract_id: contractId },
        update: {},
        select: { id: true, status: true },
      });
      invoiceState(invoice.status).assertCanFinalize();

      const breakdown = calculateInvoice({
        contract: toInvoiceContract(
          {
            id: contract.id,
            start_date: contract.start_date,
            end_date: contract.end_date,
            content_quota: contract.content_quota,
            fixed_rate: contract.fixed_rate,
          },
          contract.creators.access_revoke_date,
        ),
        contents: contract.contents.map(toInvoiceContent),
        formula,
        today,
      });
      if (Object.values(breakdown.components).some(
        (component) => component.status === 'waiting_for_data',
      )) {
        throw new UnprocessableEntityException({
          code: 'INVOICE_DATA_INCOMPLETE',
          message: 'Invoice memiliki komponen yang belum dapat dihitung',
        });
      }

      const adjustmentRows = await tx.invoice_adjustments.findMany({
        where: { invoice_id: invoice.id },
        select: INVOICE_ADJUSTMENT_SELECT,
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      });
      const adjustments = adjustmentRows.map(adjustmentDto);
      const rawTotal = breakdown.rawTotal + adjustments.reduce(
        (sum, adjustment) => sum + adjustment.amount,
        0,
      );
      const finalizedAt = new Date();
      const snapshot: InvoiceSnapshotDto = {
        ...breakdown.components,
        adjustments,
        rawTotal,
        total: Math.max(0, rawTotal),
        floored: rawTotal < 0,
        finalizedAt: finalizedAt.toISOString(),
      };
      const updated = await tx.invoices.updateMany({
        where: { id: invoice.id, status: 'running' },
        data: {
          status: 'finalized',
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          finalized_at: finalizedAt,
        },
      });
      if (updated.count !== 1) {
        throw codeError('INVOICE_FINALIZED', 'Invoice sudah difinalisasi');
      }
      return { invoiceStatus: 'finalized', adjustments, snapshot };
    }, { isolationLevel: 'ReadCommitted' });
  }

  private async lockContract(
    tx: Prisma.TransactionClient,
    contractId: string,
  ): Promise<void> {
    await tx.$queryRaw(Prisma.sql`
      SELECT id FROM contracts WHERE id = ${contractId}::uuid FOR UPDATE
    `);
  }

  private async requireContract(
    tx: Prisma.TransactionClient,
    contractId: string,
  ): Promise<void> {
    const contract = await tx.contracts.findUnique({
      where: { id: contractId },
      select: { id: true },
    });
    if (!contract) this.contractNotFound();
  }

  private contractNotFound(): never {
    throw new NotFoundException({
      code: 'CONTRACT_NOT_FOUND',
      message: 'Kontrak tidak ditemukan',
    });
  }
}
