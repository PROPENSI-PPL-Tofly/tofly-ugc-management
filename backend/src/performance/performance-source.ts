import type { SocialPlatform } from '../social/oauth-state.js';

// Where a link's performance numbers come from (PBI-27, PRD rule 7). One port, one adapter per
// source: TikTok (27.3), Instagram (27.2) and manual input. The sync (27.4) and the bonus
// (28.1) read only this, so a new source never changes how the bonus is counted
// (Open/Closed, Dependency Inversion, Strategy).

/** A link to read: its content_links id and the URL the creator sent. */
export interface SyncLink {
  id: string;
  url: string;
}

/** A link's four counts. Null means the platform gave no number: no data, never 0 (rule 4). */
export interface PerformanceMetrics {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
}

/**
 * What a read found for one link, each a data state of PRD 27:
 * - `synced`: "Tersinkron", with the numbers;
 * - `not_found`: "Link tidak ditemukan" (deleted, private, another account's, or not a video);
 * - `failed`: "Gagal sinkron", the last numbers are kept and the link is tried next run;
 * - `not_connected`: "Akun belum terhubung".
 * "Menunggu data" and "Diisi manual" are set by the sync and the manual input, not a source.
 */
export type LinkReading =
  | { linkId: string; state: 'synced'; metrics: PerformanceMetrics }
  | { linkId: string; state: 'not_found' | 'failed' | 'not_connected' };

export interface PerformanceSource {
  readonly platform: SocialPlatform;
  /**
   * Reads the creator's links on this platform, one reading per link in the order given. Calls
   * to the platform stop at `deadline` (rule 8; Finalize gives 20 s, PBI-28).
   */
  read(
    creatorId: string,
    links: readonly SyncLink[],
    deadline: AbortSignal,
  ): Promise<LinkReading[]>;
}
