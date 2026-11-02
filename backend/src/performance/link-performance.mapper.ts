import type { link_data_state, social_platform } from '@prisma/client';
import type { ConnectionRow } from './account-connections.js';
import type { LinkPerformance } from './enter-manual-performance.js';
import type { PerformanceMetrics } from './manual-performance-input.js';

/** The content_links columns a link's performance is read from. */
export interface StoredLinkPerformance extends PerformanceMetrics {
  platform: social_platform | null;
  data_state: link_data_state;
  last_synced_at: Date | null;
  manual_at: Date | null;
}

export function toLinkPerformance(
  _row: StoredLinkPerformance,
  _connection: ConnectionRow | undefined,
): LinkPerformance | null {
  throw new Error('not implemented');
}
