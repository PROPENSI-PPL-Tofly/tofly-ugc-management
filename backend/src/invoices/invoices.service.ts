import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Paging } from '../creators/paging.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { InvoiceConfirmationFields } from './dto/invoice-confirmation.dto.js';
import type {
  InvoiceAdjustmentDto,
  InvoiceDetail,
  InvoiceListItem,
  InvoiceListResponse,
  InvoiceSnapshotDto,
  InvoiceView,
} from './dto/invoice-list.dto.js';
import type { InvoiceFilters } from './invoice-filters.js';
import {
  adjustmentDto,
  CONTENT_SELECT,
  creatorName,
  INVOICE_ADJUSTMENT_SELECT,
  INVOICE_SELECT,
  type InvoiceContentRow,
  type InvoiceContractRow,
  invoiceContractStatus,
  type InvoiceCreatorRow,
  listedContracts,
  periodNumber,
  type SavedInvoice,
  savedSnapshot,
  pickContract,
  toInvoiceItem,
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
import {
  PaymentProofService,
  type PaymentProofReader,
} from './payment-proof.service.js';
import { RATE_FORMULA_SOURCE, type RateFormulaSource } from './rate-formula.js';

/**
 * The database operations this service uses: reads only. Without $transaction, $queryRaw or a
 * write, the reads cannot lock or change an invoice; that is InvoiceCommandService's job.
 */
export type InvoicesClient = Pick<
  PrismaService,
  'creators' | 'contents' | 'invoices' | 'invoice_adjustments'
>;

/** What the Rate & Invoicing table needs: one page of invoices with their summary. */
export interface InvoiceLister {
  list(
    paging: Paging,
    today?: Date,
    filters?: InvoiceFilters,
    sort?: InvoiceSort,
  ): Promise<InvoiceListResponse>;
}

/** What the invoice breakdown popups need: one creator's invoice, or null. */
export interface InvoiceDetailReader {
  detail(
    creatorId: string,
    today?: Date,
    contractId?: string,
  ): Promise<InvoiceDetail | null>;
}

/** A creator without a contract has nothing to invoice. */
const HAS_CONTRACT = {
  contracts: { some: {} },
} satisfies Prisma.creatorsWhereInput;

/** A named contract-end range narrows the roster in the query; without one it stays open. */
function rosterWhere(filters: InvoiceFilters): Prisma.creatorsWhereInput {
  const end: Prisma.DateTimeFilter = {};
  if (filters.contractEndFrom) end.gte = new Date(`${filters.contractEndFrom}T00:00:00Z`);
  if (filters.contractEndTo) end.lte = new Date(`${filters.contractEndTo}T00:00:00Z`);

  return Object.keys(end).length > 0
    ? { contracts: { some: { end_date: end } } }
    : HAS_CONTRACT;
}

const ORDER_BY: Prisma.creatorsOrderByWithRelationInput[] = [
  { first_name: 'asc' },
  { last_name: 'asc' },
  { id: 'asc' },
];

interface PickedCreator {
  row: InvoiceCreatorRow;
  contract: InvoiceContractRow;
  /** The contract the table describes for this creator, listed whatever its invoice status. */
  current: boolean;
}

interface Calculated {
  /** Every kept invoice, sorted, with its totals but without its adjustment rows. */
  items: InvoiceListItem[];
  /** The saved invoice id of each kept contract that has one, for reading the page's adjustments. */
  invoiceIds: Map<string, string>;
  /** When the creator made their moves on each kept contract's saved invoice. */
  confirmations: Map<string, InvoiceConfirmationFields>;
  runningInvoices: number;
  formulaSet: boolean;
}

/** The columns of a kept contract's saved invoice the listing reads before paging. */
interface SavedListing {
  id: string;
  snapshot: InvoiceSnapshotDto | null;
  confirmations: InvoiceConfirmationFields;
}

/** A saved invoice with its adjustments, snapshot and the creator's moves, for one invoice view. */
interface SavedLifecycle extends SavedInvoice {
  confirmations: InvoiceConfirmationFields;
}

/** Neither of the creator's moves: no saved invoice, or one they have not moved yet. */
const NO_CONFIRMATIONS: InvoiceConfirmationFields = {
  acknowledgedAt: null,
  paidAt: null,
};

/** When the creator acknowledged and confirmed receipt, as the API names them (13.1). */
function confirmationsOf(saved: {
  acknowledged_at: Date | null;
  paid_at: Date | null;
}): InvoiceConfirmationFields {
  return {
    acknowledgedAt: saved.acknowledged_at?.toISOString() ?? null,
    paidAt: saved.paid_at?.toISOString() ?? null,
  };
}

function pick(rows: InvoiceCreatorRow[], today: Date): PickedCreator[] {
  return rows.flatMap((row) =>
    listedContracts(row, today).map((contract, index) => ({
      row,
      contract,
      current: index === 0,
    })),
  );
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
    invoiceContractStatus(contract, today, row.access_revoke_date) ===
      filters.contract
  );
}

/** Keep the requested page within the available range. */
function clampPage(asked: number, pageSize: number, total: number) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return { page: Math.min(asked, totalPages), totalPages };
}

/**
 * Answers invoices: the admin's table and detail, and the creator's list. It only reads; the
 * admin's commands that change an invoice are in InvoiceCommandService.
 */
@Injectable()
export class InvoicesService implements InvoiceLister, InvoiceDetailReader {
  constructor(
    @Inject(PrismaService) private readonly prisma: InvoicesClient,
    @Inject(RATE_FORMULA_SOURCE) private readonly formulas: RateFormulaSource,
    @Inject(INVOICE_STATUS_SOURCE)
    private readonly pipeline: InvoiceStatusSource,
    @Inject(PaymentProofService)
    private readonly proofs: PaymentProofReader,
  ) {}

  async list(
    { page: asked, pageSize }: Paging,
    today = new Date(),
    filters: InvoiceFilters = {},
    sort: InvoiceSort = DEFAULT_INVOICE_SORT,
  ): Promise<InvoiceListResponse> {
    const { items, invoiceIds, confirmations, runningInvoices, formulaSet } =
      await this.calculate(today, filters, sort);

    const { page, totalPages } = clampPage(asked, pageSize, items.length);
    const onPage = items.slice((page - 1) * pageSize, page * pageSize);

    const [adjusted, proofs] = await Promise.all([
      this.withAdjustments(onPage, invoiceIds),
      this.proofs.forContracts(
        onPage.map(({ contract }) => contract.id),
        'admin',
      ),
    ]);

    return {
      items: adjusted.map((item) => ({
        ...item,
        paymentProof: proofs.get(item.contract.id) ?? null,
        ...(confirmations.get(item.contract.id) ?? NO_CONFIRMATIONS),
      })),
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
    contractId?: string,
  ): Promise<InvoiceDetail | null> {
    const row = await this.prisma.creators.findUnique({
      where: { id: creatorId },
      select: INVOICE_SELECT,
    });

    // A contract id names one of this creator's own contracts; any other answers nothing.
    const contract =
      row &&
      (contractId === undefined
        ? pickContract(row, today)
        : (row.contracts.find(({ id }) => id === contractId) ?? null));
    if (!row || !contract) return null;

    const [[view], proofs] = await Promise.all([
      this.views(row, [contract], today),
      this.proofs.forContracts([contract.id], 'admin'),
    ]);

    return { ...view, paymentProof: proofs.get(contract.id) ?? null };
  }

  /**
   * Every invoice of one creator, newest period first, for GET /me/invoices (13.1): each source
   * is read once for all their contracts. The proof link is left to the caller, which knows
   * whose route opens it.
   */
  async forCreator(
    creatorId: string,
    today = new Date(),
  ): Promise<InvoiceView[]> {
    const row = await this.prisma.creators.findUnique({
      where: { id: creatorId },
      select: INVOICE_SELECT,
    });
    if (!row || row.contracts.length === 0) return [];

    const invoices = await this.views(row, row.contracts, today);
    return invoices.sort((a, b) => b.periodNumber - a.periodNumber);
  }

  /**
   * The invoice of each of a creator's given contracts, in their order, with each source read
   * once for all of them. The one place an invoice view is put together, for the admin's detail
   * and the creator's list alike.
   */
  private async views(
    row: InvoiceCreatorRow,
    contracts: readonly InvoiceContractRow[],
    today: Date,
  ): Promise<InvoiceView[]> {
    const ids = contracts.map(({ id }) => id);
    const [byContract, statuses, formula, lifecycleByContract] =
      await Promise.all([
        this.contentsOf(ids),
        this.pipeline.statuses(ids),
        this.formulas.current(),
        this.lifecycleForContracts(ids),
      ]);

    return contracts.map((contract) => {
      const lifecycle = lifecycleByContract.get(contract.id);

      return {
        ...(lifecycle?.confirmations ?? NO_CONFIRMATIONS),
        ...toInvoiceItem(
          row,
          contract,
          // Stryker disable next-line ArrayDeclaration: equivalent mutant. The mutation hands a contract with no content one junk element; it has no status, deadline, type or platform, so no component counts it, and toInvoiceItem answers the same for every contract shape, formula and revoke date tried.
          byContract.get(contract.id) ?? [],
          formula,
          today,
          lifecycle,
        ),
        invoiceStatus: statuses.get(contract.id)!,
        periodNumber: periodNumber(row, contract),
        // A finalized invoice keeps the rules its saved totals were worked out with.
        formula: lifecycle?.snapshot
          ? (lifecycle.snapshot.formula ?? null)
          : formula,
      };
    });
  }

  private async calculate(
    today: Date,
    filters: InvoiceFilters,
    sort: InvoiceSort,
  ): Promise<Calculated> {
    const [rows, formula] = await Promise.all([
      this.prisma.creators.findMany({
        where: rosterWhere(filters),
        select: INVOICE_SELECT,
        orderBy: ORDER_BY,
      }),
      this.formulas.current(),
    ]);

    const everyone = pick(rows, today);

    // Filtering needs only where each invoice stands.
    const statuses = await this.pipeline.statuses(
      everyone.map(({ contract }) => contract.id),
    );

    const kept = everyone.filter(
      (creator) =>
        // An earlier contract's invoice stays listed until it is paid, then there is nothing
        // left to do on it.
        (creator.current || statuses.get(creator.contract.id) !== 'paid') &&
        matches(creator, filters, today) &&
        (!filters.status ||
          statuses.get(creator.contract.id) === filters.status),
    );

    // Sorting and the summary need every kept invoice's final amounts: a snapshot holds them,
    // anything else is calculated from its content and the sum of its adjustments.
    const saved = await this.savedListings(
      kept.map(({ contract }) => contract.id),
    );
    const live = kept.filter(
      ({ contract }) => !saved.get(contract.id)?.snapshot,
    );

    const [byContract, adjustmentTotals] = await Promise.all([
      this.contentsOf(live.map(({ contract }) => contract.id)),
      this.adjustmentTotals(
        live.flatMap(({ contract }) => saved.get(contract.id)?.id ?? []),
      ),
    ]);

    const items = kept.map(({ row, contract }) => {
      const invoice = saved.get(contract.id);

      return {
        ...toInvoiceItem(
          row,
          contract,
          byContract.get(contract.id) ?? [],
          formula,
          today,
          invoice && {
            adjustments: [],
            adjustmentTotal: adjustmentTotals.get(invoice.id),
            snapshot: invoice.snapshot,
          },
        ),
        invoiceStatus: statuses.get(contract.id)!,
      };
    });

    return {
      items: sortInvoices(items, sort),
      invoiceIds: new Map(
        [...saved].map(([contractId, invoice]) => [contractId, invoice.id]),
      ),
      confirmations: new Map(
        [...saved].map(([contractId, invoice]) => [
          contractId,
          invoice.confirmations,
        ]),
      ),
      runningInvoices: [...statuses.values()].filter(
        (status) => status === 'accruing',
      ).length,
      formulaSet: formula !== null,
    };
  }

  /** Read saved adjustments and snapshots for the requested contracts, for the detail. */
  private async lifecycleForContracts(
    contractIds: string[],
  ): Promise<Map<string, SavedLifecycle>> {
    const persisted = await this.prisma.invoices.findMany({
      where: { contract_id: { in: contractIds } },
      select: {
        contract_id: true,
        snapshot: true,
        acknowledged_at: true,
        paid_at: true,
        adjustments: {
          select: INVOICE_ADJUSTMENT_SELECT,
          orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
        },
      },
    });

    const result = new Map<string, SavedLifecycle>();

    for (const invoice of persisted) {
      result.set(invoice.contract_id, {
        adjustments: invoice.adjustments.map(adjustmentDto),
        snapshot: savedSnapshot(invoice.snapshot),
        confirmations: confirmationsOf(invoice),
      });
    }

    return result;
  }

  /** The id and snapshot of each requested contract's saved invoice, without its adjustments. */
  private async savedListings(
    contractIds: string[],
  ): Promise<Map<string, SavedListing>> {
    if (contractIds.length === 0) return new Map();

    const saved = await this.prisma.invoices.findMany({
      where: { contract_id: { in: contractIds } },
      select: {
        id: true,
        contract_id: true,
        snapshot: true,
        acknowledged_at: true,
        paid_at: true,
      },
    });

    return new Map(
      saved.map((invoice) => [
        invoice.contract_id,
        {
          id: invoice.id,
          snapshot: savedSnapshot(invoice.snapshot),
          confirmations: confirmationsOf(invoice),
        },
      ]),
    );
  }

  /** What each requested invoice's adjustments add up to, summed by the database. */
  private async adjustmentTotals(
    invoiceIds: string[],
  ): Promise<Map<string, Prisma.Decimal | null>> {
    if (invoiceIds.length === 0) return new Map();

    const sums = await this.prisma.invoice_adjustments.groupBy({
      by: ['invoice_id'],
      where: { invoice_id: { in: invoiceIds } },
      _sum: { amount: true },
    });

    return new Map(sums.map((sum) => [sum.invoice_id, sum._sum.amount]));
  }

  /** The page's items with their adjustment rows, read for the whole page in one query. */
  private async withAdjustments(
    items: InvoiceListItem[],
    invoiceIds: Map<string, string>,
  ): Promise<InvoiceListItem[]> {
    const ids = items.flatMap((item) => invoiceIds.get(item.contract.id) ?? []);
    if (ids.length === 0) return items;

    const rows = await this.prisma.invoice_adjustments.findMany({
      where: { invoice_id: { in: ids } },
      select: { ...INVOICE_ADJUSTMENT_SELECT, invoice_id: true },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    });

    const byInvoice = new Map<string, InvoiceAdjustmentDto[]>();

    for (const row of rows) {
      const list = byInvoice.get(row.invoice_id) ?? [];
      list.push(adjustmentDto(row));
      byInvoice.set(row.invoice_id, list);
    }

    return items.map((item) => {
      const id = invoiceIds.get(item.contract.id);
      return id ? { ...item, adjustments: byInvoice.get(id) ?? [] } : item;
    });
  }

  /** Load each requested contract's content in deadline order. */
  private async contentsOf(
    contractIds: string[],
  ): Promise<Map<string, InvoiceContentRow[]>> {
    if (contractIds.length === 0) return new Map();

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
}
