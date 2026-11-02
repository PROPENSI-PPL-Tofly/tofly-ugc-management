import type { social_platform } from '@prisma/client';
import { SOCIAL_PLATFORMS } from '../creators/new-creator.js';
import { isOneOf, listOf } from '../list-query.js';
import { isUuid } from '../uuid.js';

// The filters of the Performa Konten list and the creator's own list (PBI-27 AC 22-23), checked
// with the same multi-select rule every other list uses (list-query.ts), so a value reaches the
// query only once it is a known id or platform (OWASP A05:2025).

/** The filters of a performance link list, checked. Undefined filters on nothing. */
export interface PerformanceLinksFilters {
  creators: string[] | undefined;
  platforms: social_platform[] | undefined;
}

function isPlatform(value: unknown): value is social_platform {
  return isOneOf(SOCIAL_PLATFORMS, value);
}

export function checkPerformanceLinksQuery(
  query: Record<string, unknown>,
): PerformanceLinksFilters {
  return {
    creators: listOf(
      'creator',
      query.creator,
      isUuid,
      'creator must be creator ids',
    ),
    platforms: listOf(
      'platform',
      query.platform,
      isPlatform,
      'platform must be instagram or tiktok',
    ),
  };
}
