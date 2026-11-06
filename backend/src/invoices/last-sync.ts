import type { link_data_state, social_platform } from '@prisma/client';
import type { UnsyncedLink } from '../performance/sync/sync-outcome.js';
import type { FrozenPerformanceLinkDto } from './frozen-links.js';

// What Finalize needs from a last sync before it freezes an invoice (PBI-28 28.2, AC 7-8): one
// call that brings the contract's numbers up to date as far as it can and says how it went.
// Finalize knows only this port; PerformanceLastSync adapts 27.4's sync to it (Adapter).

export const LAST_SYNC = Symbol('LAST_SYNC');

/** How the last sync ended: answered, rejected, or still running when the 20 s ran out. */
export type LastSyncStatus = 'done' | 'failed' | 'timed_out';

export interface LastSyncResult {
  status: LastSyncStatus;
  /**
   * The links the sync left as they were; null when it ended without saying, so no link can be
   * vouched for.
   */
  notUpdated: UnsyncedLink[] | null;
}

export interface LastSync {
  /** Never rejects: a sync that fails is an answer, and Finalize goes on with stored numbers. */
  beforeFinalize(contractId: string): Promise<LastSyncResult>;
}

/** A link the last sync did not update, as Finalize names it to the admin (AC 8). */
export interface NotUpdatedLinkDto {
  contentId: string;
  contentName: string;
  platform: social_platform;
  /** Its state as frozen, which says why: not connected, not found, failed or waiting. */
  state: link_data_state;
}

/** How Finalize's last sync went, beside the frozen invoice (not part of it). */
export interface LastSyncDto {
  status: LastSyncStatus;
  notUpdated: NotUpdatedLinkDto[];
}

/**
 * The frozen links the sync did not update. Only this contract's delivered links can be named, so
 * an entry outside them is never echoed (OWASP A01). With no list (failed or timed out), every
 * delivered link is named: none of them can be vouched for.
 */
export function lastSyncReport(
  result: LastSyncResult,
  links: readonly FrozenPerformanceLinkDto[],
): LastSyncDto {
  const listed = result.notUpdated;
  const stale = listed
    ? links.filter((link) =>
        listed.some(
          (entry) =>
            entry.contentId === link.contentId &&
            entry.platform === link.platform,
        ),
      )
    : links;
  return {
    status: result.status,
    notUpdated: stale.map(({ contentId, contentName, platform, state }) => ({
      contentId,
      contentName,
      platform,
      state,
    })),
  };
}
