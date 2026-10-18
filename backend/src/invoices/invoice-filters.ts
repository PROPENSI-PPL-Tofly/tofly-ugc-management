// The Rate & Invoicing table's filters (8.4) as GET /invoices reads them: the search word, the
// contract status and the invoice status.

import { BadRequestException } from '@nestjs/common';
import { MAX_SEARCH_LENGTH } from '../creators/filters.js';
import { INVOICE_STATUSES, type InvoiceStatus } from './invoice-status.js';

/** A contract status the table filters on; a creator without a contract is never listed. */
export type InvoiceContractStatus = 'active' | 'upcoming' | 'expired';

export const INVOICE_CONTRACT_STATUSES: readonly InvoiceContractStatus[] = [
  'active',
  'upcoming',
  'expired',
];

export interface InvoiceFilters {
  /** Part of the creator's name, any case. */
  q?: string;
  /** The status of the contract the table describes for the creator. */
  contract?: InvoiceContractStatus;
  /** Where the creator's invoice stands in its pipeline. */
  status?: InvoiceStatus;
}

/**
 * Validates the raw query values once, at the edge, so the service only sees a search word
 * of a sane length, a contract status the calculator can produce and an invoice status the
 * pipeline knows. A value sent twice arrives as an array and is refused like any other.
 */
export function checkInvoiceFilters(
  q: unknown,
  contract: unknown,
  status?: unknown,
): InvoiceFilters {
  const filters: InvoiceFilters = {};

  if (typeof q === 'string' && q.trim().length > 0) {
    if (q.length > MAX_SEARCH_LENGTH) {
      throw new BadRequestException(
        `q must be ${MAX_SEARCH_LENGTH} characters or fewer`,
      );
    }
    filters.q = q.trim();
  }

  if (contract !== undefined) {
    if (
      !INVOICE_CONTRACT_STATUSES.includes(contract as InvoiceContractStatus)
    ) {
      throw new BadRequestException(
        `contract must be one of ${INVOICE_CONTRACT_STATUSES.join(', ')}`,
      );
    }
    filters.contract = contract as InvoiceContractStatus;
  }

  if (status !== undefined) {
    if (!INVOICE_STATUSES.includes(status as InvoiceStatus)) {
      throw new BadRequestException(
        `status must be one of ${INVOICE_STATUSES.join(', ')}`,
      );
    }
    filters.status = status as InvoiceStatus;
  }

  return filters;
}

/** Whether any filter is set, so the service can page in the database when none is. */
export function hasInvoiceFilters(filters: InvoiceFilters): boolean {
  return (
    filters.q !== undefined ||
    filters.contract !== undefined ||
    filters.status !== undefined
  );
}
