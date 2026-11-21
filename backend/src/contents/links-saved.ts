import { ConflictException, type Logger } from '@nestjs/common';
import type { PerformanceSyncService } from '../performance/sync/performance-sync.service.js';

// What follows a saved video link: a sync of its content (PBI-27's "Sinkronkan"), so its first
// numbers come without waiting for the daily 02:00 run. It runs on the server after the change
// has committed and nobody waits for it: the creator's request answers at once, a slow or failing
// platform never fails the save, and whatever it reads (empty numbers on a video just posted, or
// "Link tidak ditemukan" before the platform lists it) the daily run reads the link again.

/** Nest token for what LinkChangeService calls once a change of links has committed. */
export const LINKS_SAVED = Symbol('LINKS_SAVED');

/** Told the id of a content whose links were just saved; returns at once. */
export type LinksSaved = (contentId: string) => void;

export function syncInBackground(
  sync: Pick<PerformanceSyncService, 'syncContent'>,
  log: Pick<Logger, 'warn'>,
): LinksSaved {
  return (contentId) => {
    sync.syncContent(contentId).catch((error: unknown) => {
      // Already syncing, or no longer synced (its invoice froze): nothing went wrong.
      if (error instanceof ConflictException) return;
      log.warn(
        `Sync after saving the links of content ${contentId} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  };
}
