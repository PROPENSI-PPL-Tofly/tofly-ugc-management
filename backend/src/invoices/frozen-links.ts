import type { link_data_state, social_platform } from '@prisma/client';

// Each delivered link as a finalized invoice keeps it (PBI-28 28.2, AC 10): the numbers the
// contract was paid on, frozen in the snapshot so a later sync or manual entry never moves them.

/** One delivered link as Finalize reads it, inside its transaction. */
export interface FrozenLinkRow {
  content_id: string;
  content_name: string;
  platform: social_platform;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  data_state: link_data_state;
  last_synced_at: Date | null;
  manual_at: Date | null;
}

/** Where a frozen link's numbers came from; null when it never had any. */
export type FrozenLinkSource = 'synced' | 'manual' | null;

/** One delivered link in the snapshot (AC 10). */
export interface FrozenPerformanceLinkDto {
  contentId: string;
  contentName: string;
  platform: social_platform;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  source: FrozenLinkSource;
  state: link_data_state;
  /** ISO instant of the last sync that brought numbers; null if none ever did. */
  lastSyncedAt: string | null;
}

/**
 * A sync stamps last_synced_at and an admin stamps manual_at; a link the platform then could
 * not read (not_found, sync_failed) keeps the numbers of whichever came last.
 */
function sourceOf(row: FrozenLinkRow): FrozenLinkSource {
  const synced = row.last_synced_at?.getTime() ?? null;
  const typed = row.manual_at?.getTime() ?? null;
  if (typed !== null && (synced === null || typed >= synced)) return 'manual';
  return synced === null ? null : 'synced';
}

export function toFrozenLink(row: FrozenLinkRow): FrozenPerformanceLinkDto {
  return {
    contentId: row.content_id,
    contentName: row.content_name,
    platform: row.platform,
    views: row.views,
    likes: row.likes,
    comments: row.comments,
    shares: row.shares,
    source: sourceOf(row),
    state: row.data_state,
    lastSyncedAt: row.last_synced_at?.toISOString() ?? null,
  };
}
