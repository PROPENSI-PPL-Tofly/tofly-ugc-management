import type { UnsyncedLink } from '../performance/sync/sync-outcome.js';

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
