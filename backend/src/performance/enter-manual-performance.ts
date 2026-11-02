import type { link_data_state, social_platform } from '@prisma/client';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { LINK_RULES } from '../contents/link-rules.js';
import {
  invoiceState,
  type InvoiceLifecycleStatus,
} from '../invoices/invoice-lifecycle.js';
import { adminActor } from '../contents/content-event-actors.js';
import { isConnected, type ConnectionRow } from './account-connections.js';
import {
  measuredPerformance,
  type LinkPerformance,
} from './link-performance.mapper.js';
import { linkState } from './link-state.js';
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

/** The four counts alone, in the card's order, for the timeline's old and new values. */
function countsOf(metrics: PerformanceMetrics): PerformanceMetrics {
  return {
    views: metrics.views,
    likes: metrics.likes,
    comments: metrics.comments,
    shares: metrics.shares,
  };
}

/**
 * An admin typing one link's numbers in (PBI-27 AC 14-16, 18) as a command: it turns the link as
 * read under the contract lock into the writes to make, with no database in sight, so its rules
 * are tested on plain values. ManualPerformanceService runs the plan in one transaction.
 */
export class EnterManualPerformance {
  constructor(
    private readonly platform: social_platform,
    private readonly metrics: PerformanceMetrics,
  ) {}

  plan(
    target: PerformanceTarget,
    adminUserId: string | null,
    now: Date,
  ): ManualPlan {
    // manual_by and manual_at are stored together: with no admin account there is no one to name.
    if (adminUserId === null) {
      throw new ForbiddenException({
        code: 'ADMIN_ACCOUNT_REQUIRED',
        message: 'Angka manual hanya bisa diisi oleh akun Admin',
      });
    }
    // The frozen snapshot was calculated from these numbers, whatever else is wrong (AC 18).
    invoiceState(target.invoiceStatus).assertCanEnterPerformance();

    const link = target.link;
    if (!link) {
      throw new NotFoundException({
        code: 'LINK_NOT_FOUND',
        message: `Belum ada link ${LINK_RULES[this.platform].label} untuk konten ini`,
      });
    }
    linkState(link.data_state).assertAcceptsManual(
      isConnected(target.connection),
    );

    const entered = countsOf(this.metrics);

    return {
      guard: { id: link.id, data_state: link.data_state, url: link.url },
      data: {
        ...entered,
        data_state: 'manual',
        manual_by: adminUserId,
        manual_at: now,
      },
      event: {
        content_id: target.contentId,
        event_type: 'Performance Entered',
        ...adminActor(adminUserId),
        actor_user_id: adminUserId,
        occurred_at: now,
        event_data: {
          platform: this.platform,
          previous: countsOf(link),
          entered,
        },
      },
      // Read back as every reader maps a link, from the row as it will stand.
      result: measuredPerformance(
        {
          ...entered,
          data_state: 'manual',
          last_synced_at: link.last_synced_at,
          manual_at: now,
        },
        target.connection,
      ),
    };
  }
}
