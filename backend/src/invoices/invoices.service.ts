import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Paging } from '../creators/paging.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { InvoiceListResponse } from './dto/invoice-list.dto.js';
import {
  CONTENT_SELECT,
  INVOICE_SELECT,
  type InvoiceContentRow,
  pickContract,
  toInvoiceItem,
} from './invoice-rows.js';
import { RATE_FORMULA_SOURCE, type RateFormulaSource } from './rate-formula.js';

/** The slice of the database client this service touches; tests hand in a stub of just that. */
export type InvoicesClient = Pick<PrismaService, 'creators' | 'contents'>;

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
 * Loads one page of creators, then the content of the one contract per creator the table
 * describes, and leaves the arithmetic to invoice-rows and the calculator. The formula comes
 * through RateFormulaSource.
 */
@Injectable()
export class InvoicesService implements InvoiceLister {
  constructor(
    @Inject(PrismaService) private readonly prisma: InvoicesClient,
    @Inject(RATE_FORMULA_SOURCE) private readonly formulas: RateFormulaSource,
  ) {}

  async list(
    { page: asked, pageSize }: Paging,
    today = new Date(),
  ): Promise<InvoiceListResponse> {
    const [total, formula] = await Promise.all([
      this.prisma.creators.count({ where: HAS_CONTRACT }),
      this.formulas.current(),
    ]);
    // A page past the last one answers the last one, so the table needs no second request.
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(asked, totalPages);

    const rows = await this.prisma.creators.findMany({
      where: HAS_CONTRACT,
      select: INVOICE_SELECT,
      orderBy: ORDER_BY,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const picked = rows.flatMap((row) => {
      const contract = pickContract(row, today);
      return contract ? [{ row, contract }] : [];
    });

    const contents = await this.prisma.contents.findMany({
      where: { contract_id: { in: picked.map(({ contract }) => contract.id) } },
      select: CONTENT_SELECT,
      orderBy: { deadline: 'asc' },
    });
    const byContract = new Map<string, InvoiceContentRow[]>();
    for (const content of contents) {
      const list = byContract.get(content.contract_id) ?? [];
      list.push(content);
      byContract.set(content.contract_id, list);
    }

    return {
      items: picked.map(({ row, contract }) =>
        toInvoiceItem(
          row,
          contract,
          byContract.get(contract.id) ?? [],
          formula,
          today,
        ),
      ),
      page,
      pageSize,
      total,
      totalPages,
    };
  }
}
