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

function oneOf<T extends readonly string[]>(
  allowed: T,
  value: string,
  fallback: T[number],
): T[number] {
  return (allowed as readonly string[]).includes(value)
    ? (value as T[number])
    : fallback;
}

export function parseFilterQuery(
  params: Record<string, string | string[] | undefined>,
): CreatorFilters {
  const raw = single(params.q).trim();
  const contract = oneOf(CONTRACT_FILTERS, single(params.contract), 'all');
  const productivity = oneOf(PRODUCTIVITY_FILTERS, single(params.productivity), 'all');
  return { q: raw, contract, productivity };
}
