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

  // OWASP A06:2025 Insecure Design: a slow platform holds Finalize for 20 s at most (AC 7-8).
  describe('the 20-second wait', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    const never = () => new Promise<never>(() => {});
    const after = (ms: number) => () =>
      new Promise<{ notUpdated: [] }>((resolve) =>
        setTimeout(() => resolve({ notUpdated: [] }), ms),
      );

    it('is still waiting at 19,999 ms and answers timed_out at exactly 20,000 ms', async () => {
      const { adapter } = adapterFor(never);
      let answer: unknown;
      void adapter.beforeFinalize(contractId).then((value) => (answer = value));

      await vi.advanceTimersByTimeAsync(19_999);
      expect(answer).toBeUndefined();

      await vi.advanceTimersByTimeAsync(1);
      expect(answer).toEqual({ status: 'timed_out', notUpdated: null });
    });

    it('takes a sync that answers at 19,999 ms', async () => {
      const { adapter } = adapterFor(after(19_999));
      const answer = adapter.beforeFinalize(contractId);

      await vi.advanceTimersByTimeAsync(19_999);

      await expect(answer).resolves.toEqual({ status: 'done', notUpdated: [] });
    });

    it('leaves no timer behind, whether the sync answers or the wait runs out', async () => {
      const answered = adapterFor(after(5)).adapter.beforeFinalize(contractId);
      await vi.advanceTimersByTimeAsync(5);
      await answered;
      expect(vi.getTimerCount()).toBe(0);

      const timedOut = adapterFor(never).adapter.beforeFinalize(contractId);
      await vi.advanceTimersByTimeAsync(20_000);
      await timedOut;
      expect(vi.getTimerCount()).toBe(0);
    });

    // Promise.race settles with the first answer but never stops the loser: the sync runs on.
    it.each([
      ['answers', (ms: number) => after(ms)()],
      [
        'rejects',
        (ms: number) =>
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('late')), ms),
          ),
      ],
    ])('keeps timed_out when the sync %s after the wait ran out, with no stray rejection', async (_, late) => {
      const { adapter, sync, log } = adapterFor(() => late(25_000));
      const answer = adapter.beforeFinalize(contractId);

      await vi.advanceTimersByTimeAsync(30_000);

      await expect(answer).resolves.toEqual({
        status: 'timed_out',
        notUpdated: null,
      });
      expect(sync.syncContract).toHaveBeenCalledTimes(1);
      expect(log.warn).toHaveBeenCalledTimes(1);
    });

    it('warns that the wait ran out, naming the contract', async () => {
      const { adapter, log } = adapterFor(never);
      const answer = adapter.beforeFinalize(contractId);

      await vi.advanceTimersByTimeAsync(20_000);
      await answer;

      expect(log.warn).toHaveBeenCalledWith(
        `finalize last sync timed_out for contract ${contractId} (DeadlineExceeded)`,
      );
    });
  });

  it('logs nothing when the sync answers', async () => {
    const { adapter, log } = adapterFor(async () => ({ notUpdated: [] }));

    await adapter.beforeFinalize(contractId);

    expect(log.warn).not.toHaveBeenCalled();
  });
});
