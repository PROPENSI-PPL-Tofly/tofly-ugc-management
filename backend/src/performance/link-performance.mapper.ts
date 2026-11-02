import type { link_data_state, social_platform } from '@prisma/client';
import { isConnected, type ConnectionRow } from './account-connections.js';
import type { LinkPerformance } from './enter-manual-performance.js';
import { linkState } from './link-state.js';
import type { PerformanceMetrics } from './manual-performance-input.js';

// From a content_links row to the performance object every reader sends (Data Mapper): the
// Content Detail cards, the admin's Performa Konten and the creator's Performa list. One mapping,
// so the wire shape, null versus 0 and the effective state cannot drift between them.

/** The content_links columns a link's performance is read from. */
export interface StoredLinkPerformance extends PerformanceMetrics {
  platform: social_platform | null;
  data_state: link_data_state;
  last_synced_at: Date | null;
  manual_at: Date | null;
}

/** What a read selects for it: never manual_by, so the admin cannot be sent by mistake. */
export const LINK_PERFORMANCE_SELECT = {
  platform: true,
  views: true,
  likes: true,
  comments: true,
  shares: true,
  data_state: true,
  last_synced_at: true,
  manual_at: true,
} as const;

/**
 * A link's numbers and state as a card reads them (PBI-27 AC 2, 3, 19), or null for a link kept
 * from before platforms were recorded, which no platform measures. Fields are picked one by one,
 * so nothing else on the row (manual_by above all) is ever sent.
 */
export function toLinkPerformance(
  row: StoredLinkPerformance,
  connection: ConnectionRow | undefined,
): LinkPerformance | null {
  if (row.platform === null) return null;
  return {
    views: row.views,
    likes: row.likes,
    comments: row.comments,
    shares: row.shares,
    state: linkState(row.data_state).effective(isConnected(connection)),
    lastSyncedAt: row.last_synced_at?.toISOString() ?? null,
    manualAt: row.manual_at?.toISOString() ?? null,
  };
}
