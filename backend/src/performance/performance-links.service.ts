import type { link_data_state, social_platform } from '@prisma/client';
import type { Paging } from '../creators/paging.js';
import type { ConnectionRow } from './account-connections.js';
import type { LinkPerformance } from './link-performance.mapper.js';
import type { PerformanceMetrics } from './manual-performance-input.js';
import type { PerformanceLinksFilters } from './performance-links-query.js';

/** One content_links row as the list reads it, with its content and creator. */
export interface PerformanceLinkRow extends PerformanceMetrics {
  id: string;
  platform: social_platform | null;
  url: string;
  data_state: link_data_state;
  last_synced_at: Date | null;
  manual_at: Date | null;
  contents: {
    id: string;
    name: string;
    contracts: {
      creators: {
        id: string;
        first_name: string;
        middle_name: string | null;
        last_name: string | null;
        social_accounts: (ConnectionRow & { platform: social_platform })[];
      };
    };
  };
}

/** One row of the Performa Konten list (PBI-27 AC 22), as #147's table reads it. */
export interface PerformanceLinkItem extends LinkPerformance {
  linkId: string;
  contentId: string;
  contentName: string;
  creatorId: string;
  creatorName: string;
  platform: social_platform | null;
  url: string;
}

export interface PerformanceLinksPage {
  items: PerformanceLinkItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PerformanceLinksClient {
  content_links: {
    findMany(args: unknown): Promise<PerformanceLinkRow[]>;
    count(args: unknown): Promise<number>;
  };
  $transaction<T extends readonly unknown[]>(batch: [...T]): Promise<unknown>;
}

export class PerformanceLinksService {
  constructor(private readonly prisma: PerformanceLinksClient) {}

  list(
    _paging: Paging,
    _filters: PerformanceLinksFilters,
  ): Promise<PerformanceLinksPage> {
    return Promise.reject(new Error('not implemented'));
  }
}
