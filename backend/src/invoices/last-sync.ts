import type { UnsyncedLink } from '../performance/sync/sync-outcome.js';

// What Finalize needs from a last sync before it freezes an invoice (PBI-28 28.2, AC 7-8): one
// call that brings the contract's numbers up to date as far as it can and says how it went.
// Finalize knows only this port; PerformanceLastSync adapts 27.4's sync to it (Adapter).

export const LAST_SYNC = Symbol('LAST_SYNC');

/** How the last sync ended. */
export type LastSyncStatus = 'done';

export interface LastSyncResult {
  status: LastSyncStatus;
  /** The links the sync left as they were. */
  notUpdated: UnsyncedLink[];
}

export interface LastSync {
  beforeFinalize(contractId: string): Promise<LastSyncResult>;
}
