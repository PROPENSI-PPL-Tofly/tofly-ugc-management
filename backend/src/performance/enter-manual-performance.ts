import type { link_data_state, social_platform } from '@prisma/client';
import type { InvoiceLifecycleStatus } from '../invoices/invoice-lifecycle.js';
import type { ConnectionRow } from './account-connections.js';
import type { PerformanceMetrics } from './manual-performance-input.js';

/** A content's link on one platform and its contract's invoice, read under the contract lock. */
export interface PerformanceTarget {
  contentId: string;
  /** 'running' when the contract has no invoice row yet. */
  invoiceStatus: InvoiceLifecycleStatus;
  /** The creator's account on the link's platform; undefined when there is none on file. */
  connection: ConnectionRow | undefined;
  link:
    | (PerformanceMetrics & {
        id: string;
        platform: social_platform;
        url: string;
        data_state: link_data_state;
        last_synced_at: Date | null;
      })
    | null;
}

/** A link's numbers and state as a card reads them (PBI-27 AC 19); the admin is never sent. */
export interface LinkPerformance extends PerformanceMetrics {
  state: link_data_state;
  lastSyncedAt: string | null;
  manualAt: string | null;
}

/** The writes one manual entry needs, which the service runs in one transaction. */
export interface ManualPlan {
  /** Compare-and-set on the link as read, so a sync or replace landing meanwhile wins. */
  guard: { id: string; data_state: link_data_state; url: string };
  data: PerformanceMetrics & {
    data_state: 'manual';
    manual_by: string;
    manual_at: Date;
  };
  event: {
    content_id: string;
    event_type: 'Performance Entered';
    actor_name: string;
    actor_role: 'admin';
    actor_user_id: string;
    occurred_at: Date;
    event_data: {
      platform: social_platform;
      previous: PerformanceMetrics;
      entered: PerformanceMetrics;
    };
  };
  result: LinkPerformance;
}

export class EnterManualPerformance {
  constructor(
    private readonly platform: social_platform,
    private readonly metrics: PerformanceMetrics,
  ) {}

  plan(
    _target: PerformanceTarget,
    _adminUserId: string | null,
    _now: Date,
  ): ManualPlan {
    throw new Error('not implemented');
  }
}
