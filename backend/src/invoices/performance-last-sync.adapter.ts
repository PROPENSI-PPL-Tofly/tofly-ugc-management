import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { PerformanceSyncService } from '../performance/sync/performance-sync.service.js';
import type { LastSync, LastSyncResult } from './last-sync.js';

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
      const { notUpdated } = await this.sync.syncContract(contractId);
      return { status: 'done', notUpdated };
    } catch (error) {
      this.log.warn(
        `finalize last sync failed for contract ${contractId} (${kindOf(error)})`,
      );
      return { status: 'failed', notUpdated: null };
    }
  }
}
