// The order of the Rate & Invoicing table. By default what needs action comes first: an ended
// contract's invoice is ready to finalize (PBI-12), a running one still grows, one not started
// has nothing yet. An admin can also sort by name or by an amount. Each key is one comparator
// in KEYS (Strategy): another column to sort by is another entry there, not a branch below.

import { BadRequestException } from '@nestjs/common';
import type { InvoiceListItem } from './dto/invoice-list.dto.js';

export const INVOICE_SORT_KEYS = [
  'action',
  'name',
  'fixed',
  'penalty',
  'total',
] as const;

export type InvoiceSortKey = (typeof INVOICE_SORT_KEYS)[number];
export type InvoiceSortOrder = 'asc' | 'desc';

export interface InvoiceSort {
  key: InvoiceSortKey;
  order: InvoiceSortOrder;
}

export const DEFAULT_INVOICE_SORT: InvoiceSort = { key: 'action', order: 'asc' };

/** Ended first: ready to finalize. Then running, then not started. */
const ACTION_RANK: Record<InvoiceListItem['contract']['status'], number> = {
  expired: 0,
  active: 1,
  upcoming: 2,
};

type Compare = (a: InvoiceListItem, b: InvoiceListItem) => number;

const KEYS: Record<Exclude<InvoiceSortKey, 'name'>, Compare> = {
  action: (a, b) => ACTION_RANK[a.contract.status] - ACTION_RANK[b.contract.status],
  // A component still waiting for a formula has charged nothing yet, so it sorts as zero.
  fixed: (a, b) =>
    (a.components.fixedRate.amount ?? 0) - (b.components.fixedRate.amount ?? 0),
  penalty: (a, b) =>
    (a.components.penalty.amount ?? 0) - (b.components.penalty.amount ?? 0),
  total: (a, b) => a.total - b.total,
};

const byName: Compare = (a, b) => a.creatorName.localeCompare(b.creatorName, 'id');

/**
 * Validates the raw query values once, at the edge. A value sent twice arrives as an array and is
 * refused like any other unknown value.
 */
export function checkInvoiceSort(sort: unknown, order: unknown): InvoiceSort {
  const key = sort ?? DEFAULT_INVOICE_SORT.key;
  if (!INVOICE_SORT_KEYS.includes(key as InvoiceSortKey)) {
    throw new BadRequestException(
      `sort must be one of ${INVOICE_SORT_KEYS.join(', ')}`,
    );
  }
  const direction = order ?? 'asc';
  if (direction !== 'asc' && direction !== 'desc') {
    throw new BadRequestException('order must be asc or desc');
  }
  return { key: key as InvoiceSortKey, order: direction };
}

/**
 * A sorted copy of the items. The order turns the asked column around; ties always fall back to
 * the creator's name A to Z, so a column of equal amounts still reads in a stable order.
 */
export function sortInvoices(
  items: readonly InvoiceListItem[],
  { key, order }: InvoiceSort,
): InvoiceListItem[] {
  const sign = order === 'asc' ? 1 : -1;
  if (key === 'name') return [...items].sort((a, b) => sign * byName(a, b));

  const compare = KEYS[key];
  return [...items].sort((a, b) => sign * compare(a, b) || byName(a, b));
}
