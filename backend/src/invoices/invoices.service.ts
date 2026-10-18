import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Paging } from '../creators/paging.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  InvoiceDetail,
  InvoiceListItem,
  InvoiceListResponse,
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
import { RATE_FORMULA_SOURCE, type RateFormulaSource } from './rate-formula.js';

/** The slice of the database client this service touches; tests hand in a stub of just that. */
export type InvoicesClient = Pick<PrismaService, 'creators' | 'contents'>;

/** What the controller needs from the service, so it can be swapped or stubbed by contract. */
export interface InvoiceLister {
  list(
    paging: Paging,
    today?: Date,
    filters?: InvoiceFilters,
    sort?: InvoiceSort,
  ): Promise<InvoiceListResponse>;
}

/** What the breakdown popups need from the service: one creator's invoice, or null. */
export interface InvoiceDetailReader {
  detail(creatorId: string, today?: Date): Promise<InvoiceDetail | null>;
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

/** Every invoice the filters keep, sorted, with what the page says about all of them. */
interface Calculated {
  items: InvoiceListItem[];
  /** Running invoices across the whole roster: what a formula change would reach. */
  runningInvoices: number;
  formulaSet: boolean;
}

function pick(rows: InvoiceCreatorRow[], today: Date): PickedCreator[] {
  return rows.flatMap((row) => {
    const contract = pickContract(row, today);
    return contract ? [{ row, contract }] : [];
  });
}

/**
 * Whether a creator passes the table's name and contract filters. The invoice status is checked
 * apart, since it is read from the pipeline rather than worked out from the row.
 */
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
 * Reads the creators and their contracts whole, keeps the ones the filters ask for, calculates
 * every one of their invoices, then sorts and pages. Sorting by an amount, and adding up what the
 * period owes, both need every invoice worked out, so nothing is cut in the database; the roster
 * is a team's creators, not a table that grows without end. The arithmetic stays in invoice-rows
 * and the calculator; the formula comes through RateFormulaSource and where each invoice stands
 * through InvoiceStatusSource.
 */
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

    const [byContract, statuses, formula] = await Promise.all([
      this.contentsOf([contract.id]),
      this.pipeline.statuses([contract.id]),
      this.formulas.current(),
    ]);

    return {
      ...toInvoiceItem(
        row,
        contract,
        byContract.get(contract.id) ?? [],
        formula,
        today,
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
    const statuses = await this.pipeline.statuses(
      everyone.map(({ contract }) => contract.id),
    );

    const kept = everyone.filter(
      (creator) =>
        matches(creator, filters, today) &&
        (!filters.status ||
          statuses.get(creator.contract.id) === filters.status),
    );
    const byContract = await this.contentsOf(
      kept.map(({ contract }) => contract.id),
    );
    const items = kept.map(({ row, contract }) => ({
      ...toInvoiceItem(
        row,
        contract,
        byContract.get(contract.id) ?? [],
        formula,
        today,
      ),
      // The pipeline answers for every contract it is asked about.
      invoiceStatus: statuses.get(contract.id)!,
    }));

    return {
      items: sortInvoices(items, sort),
      runningInvoices: [...statuses.values()].filter(
        (status) => status === 'accruing',
      ).length,
      formulaSet: formula !== null,
    };
  }

  /** The content of each contract asked about, by contract, in deadline order. */
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
}
