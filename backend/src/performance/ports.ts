// What syncing content performance (PBI-27) needs from each platform. Instagram (27.2) and TikTok
// (27.3) each implement PerformanceSource; the sync (27.4) only ever talks to this interface, so it
// saves numbers and states without knowing which platform answered (Strategy, Dependency Inversion).

import type { SocialPlatform } from '../social/oauth-state.js';

// The four numbers of one link. Null is no data yet, never 0 (AC 1, 2).
export interface PerformanceMetrics {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
}

// One submitted link to read, as content_links holds it.
export interface SourceLink {
  id: string;
  url: string;
}

// What the platform said about one link. Not found and failed carry no numbers, so the sync keeps
// the ones it already has (AC 6, 8).
export type LinkReading =
  | { linkId: string; outcome: 'synced'; metrics: PerformanceMetrics }
  // Deleted, private, or from an account other than the connected one (AC 8, 11).
  | { linkId: string; outcome: 'not_found' }
  // Retried in the next run (AC 6). The reason is safe for the log: never a token.
  | { linkId: string; outcome: 'failed'; reason: string };

export type SourceResult =
  // No account to read with, or its token could not be refreshed (AC 7).
  { outcome: 'disconnected' } | { outcome: 'read'; readings: LinkReading[] };

export interface PerformanceSource {
  readonly platform: SocialPlatform;
  // Every link one creator submitted on this platform at once, so a platform reads its media
  // list or batches its ids once per account rather than once per link.
  read(creatorId: string, links: readonly SourceLink[]): Promise<SourceResult>;
}

// One link of a contract the sync could not bring up to date, named by its content and platform
// (a content holds one link per platform).
export interface UnsyncedLink {
  contentId: string;
  platform: SocialPlatform;
}

// What Finalize asks of the sync (PBI-28 AC 7): bring every link of one contract up to date once
// more. 27.4 implements it; null means no sync is wired in yet, so the stored numbers stand.
export interface ContractSync {
  syncContract(
    contractId: string,
  ): Promise<{ notUpdated: UnsyncedLink[] } | null>;
}

export const CONTRACT_SYNC = Symbol('CONTRACT_SYNC');

/** The sync before 27.4 binds its own: nothing to fetch, so Finalize goes on at once. */
export const NO_CONTRACT_SYNC: ContractSync = Object.freeze({
  syncContract: () => Promise.resolve(null),
});
