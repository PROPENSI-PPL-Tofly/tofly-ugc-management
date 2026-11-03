import type { InvoiceFilters } from './invoice-filters.js';
import type { InvoiceContentRow, InvoiceCreatorRow } from './invoice-rows.js';

/**
 * Where the running invoice reads what it is calculated from: the creators and contracts the
 * table lists, and the content of the contracts it calculates, links included (28.1). A port
 * (Repository), so InvoicesService asks for its inputs without knowing how they are queried,
 * and its tests can hand in a stand-in instead of a database.
 */
export interface InvoiceRosterRepository {
  /** Every creator with a contract the filters' contract-end range admits, in name order. */
  creators(filters: InvoiceFilters): Promise<InvoiceCreatorRow[]>;
  /** Each requested contract's content with its links, in deadline order. */
  contentsOf(contractIds: string[]): Promise<Map<string, InvoiceContentRow[]>>;
}

/** Nest injection token for InvoiceRosterRepository, since an interface does not exist at runtime. */
export const INVOICE_ROSTER_REPOSITORY = Symbol('INVOICE_ROSTER_REPOSITORY');
