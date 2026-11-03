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

  // OWASP A10:2025 Mishandling of Exceptional Conditions: a sync that throws fails no Finalize.
  it.each([
    ['an Error', new Error('platform down')],
    ['a thrown string', 'boom'],
    ['undefined', undefined],
  ])('answers failed, with no list it can vouch for, when the sync rejects with %s', async (_, reason) => {
    const { adapter } = adapterFor(() => Promise.reject(reason));

    await expect(adapter.beforeFinalize(contractId)).resolves.toEqual({
      status: 'failed',
      notUpdated: null,
    });
  });

  // OWASP A09:2025 Security Logging and Alerting Failures: a failed last sync is never silent, and
  // the warning names the contract and the error's kind only, never its message (it may quote a
  // token or a platform's answer).
  it.each([
    [new TypeError('token abc123 rejected'), 'TypeError'],
    ['token abc123 rejected', 'unknown error'],
  ])('warns once with the contract and the kind of %s, never its text', async (reason, kind) => {
    const { adapter, log } = adapterFor(() => Promise.reject(reason));

    await adapter.beforeFinalize(contractId);

    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith(
      `finalize last sync failed for contract ${contractId} (${kind})`,
    );
  });

  it('logs nothing when the sync answers', async () => {
    const { adapter, log } = adapterFor(async () => ({ notUpdated: [] }));

    await adapter.beforeFinalize(contractId);

    expect(log.warn).not.toHaveBeenCalled();
  });
});
