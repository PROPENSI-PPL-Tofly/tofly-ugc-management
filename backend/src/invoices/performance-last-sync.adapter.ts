import { Inject, Injectable } from '@nestjs/common';
import { PerformanceSyncService } from '../performance/sync/performance-sync.service.js';
import type { LastSync, LastSyncResult } from './last-sync.js';

/** The part of 27.4's sync the adapter calls. */
export type ContractSync = Pick<PerformanceSyncService, 'syncContract'>;

/**
 * Adapter: Finalize asks LastSync#beforeFinalize; 27.4's PerformanceSyncService answers
 * syncContract. This class turns one into the other, so neither side changes for the other.
 */
@Injectable()
export class PerformanceLastSync implements LastSync {
  constructor(
    @Inject(PerformanceSyncService) private readonly sync: ContractSync,
  ) {}

  async beforeFinalize(contractId: string): Promise<LastSyncResult> {
    const { notUpdated } = await this.sync.syncContract(contractId);
    return { status: 'done', notUpdated };
  }
}
