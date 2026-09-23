import { BadRequestException } from '@nestjs/common';
import type { ContractStatus, Productivity } from './creator-metrics.js';

export const CONTRACT_STATUSES: ContractStatus[] = ['active', 'expired', 'upcoming', 'none'];
export const PRODUCTIVITIES: Productivity[] = ['good', 'watch', 'risk'];
/** Nobody searches for a paragraph; a cap keeps a hostile query from driving the scan. */
export const MAX_SEARCH_LENGTH = 100;

export interface Filters {
  q?: string;
  contractStatus?: ContractStatus;
  productivity?: Productivity;
}

/**
 * Validates the raw query values once, at the edge, so nothing downstream has to check
 * whether contractStatus/productivity are one of the values the metrics module actually
 * produces.
 */
export function checkFilters(q: unknown, contractStatus: unknown, productivity: unknown): Filters {
  const filters: Filters = {};

  if (typeof q === 'string' && q.trim().length > 0) {
    if (q.length > MAX_SEARCH_LENGTH) {
      throw new BadRequestException(`q must be ${MAX_SEARCH_LENGTH} characters or fewer`);
    }
    filters.q = q.trim();
  }

  if (contractStatus !== undefined) {
    if (!CONTRACT_STATUSES.includes(contractStatus as ContractStatus)) {
      throw new BadRequestException(`contractStatus must be one of ${CONTRACT_STATUSES.join(', ')}`);
    }
    filters.contractStatus = contractStatus as ContractStatus;
  }

  if (productivity !== undefined) {
    if (!PRODUCTIVITIES.includes(productivity as Productivity)) {
      throw new BadRequestException(`productivity must be one of ${PRODUCTIVITIES.join(', ')}`);
    }
    filters.productivity = productivity as Productivity;
  }

  return filters;
}
