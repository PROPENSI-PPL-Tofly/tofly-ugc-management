import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Paging } from '../creators/paging.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  InvoiceDetail,
  InvoiceListResponse,
} from './dto/invoice-list.dto.js';
import { hasInvoiceFilters, type InvoiceFilters } from './invoice-filters.js';
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
 * Loads one page of creators, then the content of the one contract per creator the table
 * describes, and leaves the arithmetic to invoice-rows and the calculator. The formula comes
 * through RateFormulaSource.
 *
 * Without filters the page is cut in the database. A filter reads the contract's status,
 * which is worked out from its dates rather than stored, so with one the creators and their
 * contracts (no content) are read whole, filtered and paged here, the way the Creator
 * Database filters; content is still loaded for the page alone. Where each invoice stands comes
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
  ): Promise<InvoiceListResponse> {
    const [{ picked, page, total, totalPages }, formula] = await Promise.all([
      hasInvoiceFilters(filters)
        ? this.filteredPage(asked, pageSize, today, filters)
        : this.page(asked, pageSize, today),
      this.formulas.current(),
    ]);

    const ids = picked.map(({ contract }) => contract.id);
    const [byContract, statuses] = await Promise.all([
      this.contentsOf(ids),
      this.pipeline.statuses(ids),
    ]);

    return {
      items: picked.map(({ row, contract }) => ({
        ...toInvoiceItem(
          row,
          contract,
          byContract.get(contract.id) ?? [],
          formula,
          today,
        ),
        // The pipeline answers for every contract it is asked about.
        invoiceStatus: statuses.get(contract.id)!,
      })),
      page,
      pageSize,
      total,
      totalPages,
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
    let matched = pick(rows, today).filter((creator) =>
      matches(creator, filters, today),
    );
    if (filters.status) {
      const statuses = await this.pipeline.statuses(
        matched.map(({ contract }) => contract.id),
      );
      matched = matched.filter(
        ({ contract }) => statuses.get(contract.id) === filters.status,
      );
    }
    const { page, totalPages } = clampPage(asked, pageSize, matched.length);
    return {
      picked: matched.slice((page - 1) * pageSize, page * pageSize),
      page,
      total: matched.length,
      totalPages,
    };
  }
}
