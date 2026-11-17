import { ConflictException, NotFoundException } from '@nestjs/common';
import type { PerformanceSyncService } from '../performance/sync/performance-sync.service.js';
import { syncInBackground } from './links-saved.js';

// A saved link starts a sync of its content on the server, without the creator waiting for it:
// the first numbers may well be empty, and the daily run reads every link again anyway.
describe('syncInBackground', () => {
  type SyncAnswer = Awaited<ReturnType<PerformanceSyncService['syncContent']>>;

  function setup(sync: () => Promise<SyncAnswer>) {
    const syncContent = vi.fn(sync);
    const warn = vi.fn();
    const linksSaved = syncInBackground({ syncContent }, { warn });
    return { linksSaved, syncContent, warn };
  }

  it("starts a sync of the content's links", () => {
    const { linksSaved, syncContent } = setup(() => Promise.resolve({ notUpdated: [] }));

    linksSaved('content-1');

    expect(syncContent).toHaveBeenCalledExactlyOnceWith('content-1');
  });

  it('answers at once, without waiting for the platforms', () => {
    const { linksSaved } = setup(() => new Promise(() => undefined));

    expect(linksSaved('content-1')).toBeUndefined();
  });

  // Another sync already holds the content, or it may no longer be synced: nothing to report.
  it.each([
    ['SYNC_RUNNING', new ConflictException({ code: 'SYNC_RUNNING' })],
    ['SYNC_NOT_ALLOWED', new ConflictException({ code: 'SYNC_NOT_ALLOWED' })],
  ])('lets a refused sync (%s) go quietly', async (_code, refusal) => {
    const { linksSaved, warn } = setup(() => Promise.reject(refusal));

    linksSaved('content-1');
    await vi.waitFor(() => expect(warn).not.toHaveBeenCalled());
  });

  it('logs any other failure and never lets it reach the request that saved the link', async () => {
    const { linksSaved, warn } = setup(() =>
      Promise.reject(new NotFoundException({ code: 'CONTENT_NOT_FOUND' })),
    );

    expect(() => linksSaved('content-1')).not.toThrow();
    await vi.waitFor(() =>
      expect(warn).toHaveBeenCalledExactlyOnceWith(
        expect.stringContaining('content-1'),
      ),
    );
  });
});
