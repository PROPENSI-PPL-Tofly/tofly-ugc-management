export const CONTRACT_FILTERS = ['all', 'active', 'expired'] as const;
export type ContractFilter = (typeof CONTRACT_FILTERS)[number];

export const PRODUCTIVITY_FILTERS = ['all', 'good', 'watch', 'risk'] as const;
export type ProductivityFilter = (typeof PRODUCTIVITY_FILTERS)[number];

export interface CreatorFilters {
  q: string;
  contract: ContractFilter;
  productivity: ProductivityFilter;
}

function single(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export function parseFilterQuery(
  _params: Record<string, string | string[] | undefined>,
): CreatorFilters {
  throw new Error('NOT_IMPLEMENTED');
}
