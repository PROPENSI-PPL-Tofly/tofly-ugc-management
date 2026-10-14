import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Paging } from '../creators/paging.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  InvoiceListItem,
  InvoiceListResponse,
} from './dto/invoice-list.dto.js';
import { INVOICE_SELECT, toInvoiceItem } from './invoice-rows.js';
import { RATE_FORMULA_SOURCE, type RateFormulaSource } from './rate-formula.js';

/** The slice of the database client this service touches; tests hand in a stub of just that. */
export type InvoicesClient = Pick<PrismaService, 'creators'>;

/** What the controller needs from the service, so it can be swapped or stubbed by contract. */
export interface InvoiceLister {
  list(paging: Paging, today?: Date): Promise<InvoiceListResponse>;
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

/**
 * Loads one page of creators with the rows their invoice needs, in one query, and leaves the
 * arithmetic to invoice-rows and the calculator. The formula comes through RateFormulaSource,
 * so the stored formula (8.1) replaces the placeholder without a change here.
 */
@Injectable()
export class InvoicesService implements InvoiceLister {
  constructor(
    @Inject(PrismaService) private readonly prisma: InvoicesClient,
    @Inject(RATE_FORMULA_SOURCE) private readonly formulas: RateFormulaSource,
  ) {}

  async list(
    { page, pageSize }: Paging,
    today = new Date(),
  ): Promise<InvoiceListResponse> {
    const [rows, total, formula] = await Promise.all([
      this.prisma.creators.findMany({
        where: HAS_CONTRACT,
        select: INVOICE_SELECT,
        orderBy: ORDER_BY,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.creators.count({ where: HAS_CONTRACT }),
      this.formulas.current(),
    ]);

    const items = rows
      .map((row) => toInvoiceItem(row, formula, today))
      .filter((item): item is InvoiceListItem => item !== null);

    return {
      items,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }
}
