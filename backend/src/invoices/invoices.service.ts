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
import type {
  InvoiceAdjustmentDto,
  InvoiceDetail,
  InvoiceListItem,
  InvoiceListResponse,
  InvoiceSnapshotDto,
} from './dto/invoice-list.dto.js';
import type { InvoiceFilters } from './invoice-filters.js';
import {
  CONTENT_SELECT,
  creatorName,
  INVOICE_SELECT,
  type InvoiceContentRow,
  type InvoiceContractRow,
  invoiceContractStatus,
  type InvoiceCreatorRow,
  periodNumber,
  pickContract,
  toInvoiceContent,
  toInvoiceContract,
  toInvoiceItem,
  adjustedTotals,
} from './invoice-rows.js';
import {
  DEFAULT_INVOICE_SORT,
  type InvoiceSort,
  sortInvoices,
} from './invoice-sort.js';
import {
  INVOICE_STATUS_SOURCE,
  type InvoiceStatusSource,
} from './invoice-status.js';
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
    sort?: InvoiceSort,
  ): Promise<InvoiceListResponse>;

  addAdjustment(
    contractId: string,
    input: ManualAdjustmentInput,
    actorUserId: string,
  ): Promise<InvoiceAdjustmentDto & { invoiceStatus: 'running' }>;

  finalize(
    contractId: string,
    today?: Date,
  ): Promise<{
    invoiceStatus: 'finalized';
    adjustments: InvoiceAdjustmentDto[];
    snapshot: InvoiceSnapshotDto;
  }>;
}

/** What the invoice breakdown popups need: one creator's invoice, or null. */
export interface InvoiceDetailReader {
  detail(creatorId: string, today?: Date): Promise<InvoiceDetail | null>;
}

/** Lifecycle data persisted for a contract's invoice. */
interface InvoiceLifecycle {
  status: 'running' | 'finalized';
  adjustments: InvoiceAdjustmentDto[];
  snapshot: InvoiceSnapshotDto | null;
}

/** A creator without a contract has nothing to invoice. */
const HAS_CONTRACT = {
  contracts: { some: {} },
} satisfies Prisma.creatorsWhereInput;

const ORDER_BY: Prisma.creatorsOrderByWithRelationInput[] = [
  { first_name: 'asc' },
  { last_name: 'asc' },
  { id: 'asc' },
];

interface PickedCreator {
  row: InvoiceCreatorRow;
  contract: InvoiceContractRow;
}

interface Calculated {
  items: InvoiceListItem[];
  runningInvoices: number;
  formulaSet: boolean;
}

function pick(rows: InvoiceCreatorRow[], today: Date): PickedCreator[] {
  return rows.flatMap((row) => {
    const contract = pickContract(row, today);
    return contract ? [{ row, contract }] : [];
  });
}

/** Match creator-name and contract filters; invoice status is evaluated separately. */
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

/** Keep the requested page within the available range. */
function clampPage(asked: number, pageSize: number, total: number) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return { page: Math.min(asked, totalPages), totalPages };
}

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

@Injectable()
export class InvoicesService implements InvoiceLister, InvoiceDetailReader {
  constructor(
    @Inject(PrismaService) private readonly prisma: InvoicesClient,
    @Inject(RATE_FORMULA_SOURCE) private readonly formulas: RateFormulaSource,
    @Inject(INVOICE_STATUS_SOURCE)
    private readonly pipeline: InvoiceStatusSource,
  ) {}

  async list(
    { page: asked, pageSize }: Paging,
    today = new Date(),
    filters: InvoiceFilters = {},
    sort: InvoiceSort = DEFAULT_INVOICE_SORT,
  ): Promise<InvoiceListResponse> {
    const { items, runningInvoices, formulaSet } = await this.calculate(
      today,
      filters,
      sort,
    );

    const { page, totalPages } = clampPage(asked, pageSize, items.length);

    return {
      items: items.slice((page - 1) * pageSize, page * pageSize),
      page,
      pageSize,
      total: items.length,
      totalPages,
      summary: {
        total: items.reduce((sum, item) => sum + item.total, 0),
        runningInvoices,
        formulaSet,
      },
    };
  }

  async detail(
    creatorId: string,
    today = new Date(),
  ): Promise<InvoiceDetail | null> {
    const row = await this.prisma.creators.findUnique({
      where: { id: creatorId },
      select: INVOICE_SELECT,
    });

    const contract = row && pickContract(row, today);
    if (!row || !contract) return null;

    const [byContract, statuses, formula, lifecycleByContract] =
      await Promise.all([
        this.contentsOf([contract.id]),
        this.pipeline.statuses([contract.id]),
        this.formulas.current(),
        this.lifecycleForContracts([contract.id]),
      ]);

    const lifecycle = lifecycleByContract.get(contract.id) ?? {
      status: 'running' as const,
      adjustments: [],
      snapshot: null,
    };

    return {
      ...toInvoiceItem(
        row,
        contract,
        byContract.get(contract.id) ?? [],
        formula,
        today,
        lifecycle,
      ),
      invoiceStatus: statuses.get(contract.id)!,
      periodNumber: periodNumber(row, contract),
      formula,
    };
  }

  private async calculate(
    today: Date,
    filters: InvoiceFilters,
    sort: InvoiceSort,
  ): Promise<Calculated> {
    const [rows, formula] = await Promise.all([
      this.prisma.creators.findMany({
        where: HAS_CONTRACT,
        select: INVOICE_SELECT,
        orderBy: ORDER_BY,
      }),
      this.formulas.current(),
    ]);

    const everyone = pick(rows, today);
    const contractIds = everyone.map(({ contract }) => contract.id);

    const [statuses, lifecycleByContract] = await Promise.all([
      this.pipeline.statuses(contractIds),
      this.lifecycleForContracts(contractIds),
    ]);

    const kept = everyone.filter(
      (creator) =>
        matches(creator, filters, today) &&
        (!filters.status ||
          statuses.get(creator.contract.id) === filters.status),
    );

    const byContract = await this.contentsOf(
      kept.map(({ contract }) => contract.id),
    );

    const items = kept.map(({ row, contract }) => {
      const lifecycle = lifecycleByContract.get(contract.id) ?? {
        status: 'running' as const,
        adjustments: [],
        snapshot: null,
      };

      return {
        ...toInvoiceItem(
          row,
          contract,
          byContract.get(contract.id) ?? [],
          formula,
          today,
          lifecycle,
        ),
        invoiceStatus: statuses.get(contract.id)!,
      };
    });

    return {
      items: sortInvoices(items, sort),
      runningInvoices: [...statuses.values()].filter(
        (status) => status === 'accruing',
      ).length,
      formulaSet: formula !== null,
    };
  }

  /** Read stored adjustments and snapshots for the requested contracts. */
  private async lifecycleForContracts(
    contractIds: string[],
  ): Promise<Map<string, InvoiceLifecycle>> {
    if (contractIds.length === 0) return new Map();

    const persisted = await this.prisma.invoices.findMany({
      where: { contract_id: { in: contractIds } },
      select: {
        contract_id: true,
        status: true,
        snapshot: true,
        adjustments: {
          select: INVOICE_ADJUSTMENT_SELECT,
          orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
        },
      },
    });

    const result = new Map<string, InvoiceLifecycle>();

    for (const invoice of persisted) {
      result.set(invoice.contract_id, {
        status: invoice.status,
        adjustments: invoice.adjustments.map(adjustmentDto),
        snapshot: invoice.snapshot as unknown as InvoiceSnapshotDto | null,
      });
    }

    return result;
  }

  /** Load each requested contract's content in deadline order. */
  private async contentsOf(
    contractIds: string[],
  ): Promise<Map<string, InvoiceContentRow[]>> {
    const contents = await this.prisma.contents.findMany({
      where: { contract_id: { in: contractIds } },
      select: CONTENT_SELECT,
      orderBy: { deadline: 'asc' },
    });

    const byContract = new Map<string, InvoiceContentRow[]>();

    for (const content of contents) {
      const list = byContract.get(content.contract_id) ?? [];
      list.push(content);
      byContract.set(content.contract_id, list);
    }

    return byContract;
  }

  async addAdjustment(
    contractId: string,
    input: ManualAdjustmentInput,
    actorUserId: string,
  ): Promise<InvoiceAdjustmentDto & { invoiceStatus: 'running' }> {
    return this.prisma.$transaction(
      async (tx) => {
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
      },
      { isolationLevel: 'ReadCommitted' },
    );
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

    return this.prisma.$transaction(
      async (tx) => {
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
            contents: {
              select: CONTENT_SELECT,
              orderBy: { deadline: 'asc' },
            },
          },
        });

        if (!contract) this.contractNotFound();

        if (
          jakartaDay(today) <= contract.end_date.toISOString().slice(0, 10)
        ) {
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

        if (
          Object.values(breakdown.components).some(
            (component) => component.status === 'waiting_for_data',
          )
        ) {
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

        // today is the request's instant, not a day: the breakdown is as of it, so it is when
        // the invoice was finalized.
        const snapshot: InvoiceSnapshotDto = {
          ...breakdown.components,
          adjustments,
          ...adjustedTotals(breakdown.rawTotal, adjustments),
          finalizedAt: today.toISOString(),
        };

        const updated = await tx.invoices.updateMany({
          where: { id: invoice.id, status: 'running' },
          data: {
            status: 'finalized',
            snapshot: snapshot as unknown as Prisma.InputJsonValue,
            finalized_at: today,
          },
        });

        if (updated.count !== 1) {
          throw codeError('INVOICE_FINALIZED', 'Invoice sudah difinalisasi');
        }

        return { invoiceStatus: 'finalized', adjustments, snapshot };
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  private async lockContract(
    tx: Prisma.TransactionClient,
    contractId: string,
  ): Promise<void> {
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM contracts WHERE id = ${contractId}::uuid FOR UPDATE`,
    );
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