import type { social_platform } from '@prisma/client';

/** The filters of a performance link list, checked. Undefined filters on nothing. */
export interface PerformanceLinksFilters {
  creators: string[] | undefined;
  platforms: social_platform[] | undefined;
}

export function checkPerformanceLinksQuery(
  _query: Record<string, unknown>,
): PerformanceLinksFilters {
  throw new Error('not implemented');
}
