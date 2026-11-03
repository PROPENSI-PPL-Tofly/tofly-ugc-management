import { PerformanceLastSync } from './performance-last-sync.adapter.js';

// Finalize's last sync (PBI-28 28.2, AC 7-8) through 27.4's PerformanceSyncService#syncContract.
// The sync service is a stub: these tests pin what the adapter makes of its answers.

describe('PerformanceLastSync', () => {
  const contractId = '7d0d1c3e-6f6a-4d55-9a37-1b1c1d1e1f10';

  function adapterFor(syncContract: () => Promise<{ notUpdated: unknown[] }>) {
    const sync = { syncContract: vi.fn(syncContract) };
    const log = { warn: vi.fn() };
    return { sync, log, adapter: new PerformanceLastSync(sync as never, log) };
  }

  it('asks the sync for the contract and hands back the links it did not update', async () => {
    const notUpdated = [{ contentId: 'content-1', platform: 'tiktok' }];
    const { sync, adapter } = adapterFor(async () => ({ notUpdated }));

    await expect(adapter.beforeFinalize(contractId)).resolves.toEqual({
      status: 'done',
      notUpdated,
    });
    expect(sync.syncContract).toHaveBeenCalledWith(contractId);
  });
});
