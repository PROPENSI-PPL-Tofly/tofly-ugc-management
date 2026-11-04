import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { InvoiceFilters } from './invoice-filters.js';
import type { InvoiceRosterRepository } from './invoice-roster.repository.js';
import {
  CONTENT_SELECT,
  INVOICE_SELECT,
  type InvoiceContentRow,
  type InvoiceCreatorRow,
} from './invoice-rows.js';

/** The tables this repository reads, and only those; a test hands in a stub of just them. */
export type InvoiceRosterClient = Pick<PrismaService, 'creators' | 'contents'>;

/** A creator without a contract has nothing to invoice. */
const HAS_CONTRACT = {
  contracts: { some: {} },
} satisfies Prisma.creatorsWhereInput;

/** A named contract-end range narrows the roster in the query; without one it stays open. */
function rosterWhere(filters: InvoiceFilters): Prisma.creatorsWhereInput {
  const end: Prisma.DateTimeFilter = {};
  if (filters.contractEndFrom)
    end.gte = new Date(`${filters.contractEndFrom}T00:00:00Z`);
  if (filters.contractEndTo)
    end.lte = new Date(`${filters.contractEndTo}T00:00:00Z`);

  return Object.keys(end).length > 0
    ? { contracts: { some: { end_date: end } } }
    : HAS_CONTRACT;
}

const ORDER_BY: Prisma.creatorsOrderByWithRelationInput[] = [
  { first_name: 'asc' },
  { last_name: 'asc' },
  { id: 'asc' },
];

/** InvoiceRosterRepository on Prisma: the only place the running invoice's inputs are queried. */
@Injectable()
export class PrismaInvoiceRosterRepository implements InvoiceRosterRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: InvoiceRosterClient,
  ) {}

  creators(filters: InvoiceFilters): Promise<InvoiceCreatorRow[]> {
    return this.prisma.creators.findMany({
      where: rosterWhere(filters),
      select: INVOICE_SELECT,
      orderBy: ORDER_BY,
    });
  }

  async contentsOf(
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
