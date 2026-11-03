import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  CONTRACT_DEADLINE_MS,
  PerformanceSyncService,
} from '../performance/sync/performance-sync.service.js';
import {
  DeadlineExceeded,
  withDeadline,
} from '../performance/sync/run-limits.js';
import type { LastSync, LastSyncResult } from './last-sync.js';

/** How long Finalize waits for its last sync: 27.4's own limit for a contract's run (AC 7). */
export const FINALIZE_SYNC_DEADLINE_MS = CONTRACT_DEADLINE_MS;

/** The part of 27.4's sync the adapter calls. */
export type ContractSync = Pick<PerformanceSyncService, 'syncContract'>;

export const LAST_SYNC_LOG = Symbol('LAST_SYNC_LOG');

export interface LastSyncLog {
  warn(message: string): void;
}

// Only the error's kind reaches the log: its text may quote a token or a platform's answer.
function kindOf(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown error';
}

/**
 * Adapter: Finalize asks LastSync#beforeFinalize; 27.4's PerformanceSyncService answers
 * syncContract. This class turns one into the other, so neither side changes for the other.
 */
@Injectable()
export class PerformanceLastSync implements LastSync {
  constructor(
    @Inject(PerformanceSyncService) private readonly sync: ContractSync,
    @Optional()
    @Inject(LAST_SYNC_LOG)
    private readonly log: LastSyncLog = new Logger('FinalizeLastSync'),
  ) {}

  async beforeFinalize(contractId: string): Promise<LastSyncResult> {
    try {
      const { notUpdated } = await withDeadline(
        this.sync.syncContract(contractId),
        FINALIZE_SYNC_DEADLINE_MS,
      );
      return { status: 'done', notUpdated };
    } catch (error) {
      // The deadline only stops the waiting: the sync itself runs on to its own 20 s limits, and
      // whatever it saves later never reaches this invoice's snapshot.
      const status = error instanceof DeadlineExceeded ? 'timed_out' : 'failed';
      this.log.warn(
        `finalize last sync ${status} for contract ${contractId} (${kindOf(error)})`,
      );
      return { status, notUpdated: null };
    }
  }
}
