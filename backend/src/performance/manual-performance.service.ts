import type { link_data_state, social_platform } from '@prisma/client';
import type { InvoiceLifecycleStatus } from '../invoices/invoice-lifecycle.js';
import type { ConnectionRow } from './account-connections.js';
import type { LinkPerformance } from './enter-manual-performance.js';
import type { PerformanceMetrics } from './manual-performance-input.js';

/** The content as one read inside the transaction finds it: its link and its account on a platform. */
export interface ManualContentRow {
  id: string;
  contract_id: string;
  contracts: {
    invoice: { status: InvoiceLifecycleStatus } | null;
    creators: {
      social_accounts: (ConnectionRow & { platform: social_platform })[];
    };
  };
  content_links: (PerformanceMetrics & {
    id: string;
    platform: social_platform | null;
    url: string;
    data_state: link_data_state;
    last_synced_at: Date | null;
  })[];
}

/** The slice of Prisma a manual entry uses, so unit tests stub exactly that. */
export interface ManualPerformanceTransaction {
  contents: { findFirst(args: unknown): Promise<ManualContentRow | null> };
  content_links: { updateMany(args: unknown): Promise<{ count: number }> };
  content_events: { create(args: unknown): Promise<unknown> };
}

export interface ManualPerformanceClient {
  $transaction<T>(
    work: (transaction: ManualPerformanceTransaction) => Promise<T>,
  ): Promise<T>;
}

export class ManualPerformanceService {
  constructor(private readonly prisma: ManualPerformanceClient) {}

  enter(
    _contentId: string,
    _platform: social_platform,
    _metrics: PerformanceMetrics,
    _adminUserId: string | null,
    _now: Date,
  ): Promise<LinkPerformance> {
    return Promise.reject(new Error('not implemented'));
  }
}
