import { Prisma, link_data_state, social_platform } from '@prisma/client';

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
export function sourceOf(
  row: Pick<FrozenLinkRow, 'last_synced_at' | 'manual_at'>,
): FrozenLinkSource {
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

/** The part of a transaction client the read uses. */
export interface FrozenLinksClient {
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
}

/**
 * The contract's delivered links, first handed in first, read and share-locked in one statement.
 * Under Read Committed each statement sees what was committed when it began; the share lock then
 * keeps any sync or manual write off these rows until Finalize commits, so the snapshot holds one
 * consistent set of numbers (AC 10-11).
 */
export function lockDeliveredLinks(
  tx: FrozenLinksClient,
  contractId: string,
): Promise<FrozenLinkRow[]> {
  return tx.$queryRaw<FrozenLinkRow[]>(Prisma.sql`
    SELECT l.content_id, c.name AS content_name, l.platform, l.views, l.likes, l.comments,
      l.shares, l.data_state, l.last_synced_at, l.manual_at
    FROM content_links l JOIN contents c ON c.id = l.content_id
    WHERE c.contract_id = ${contractId}::uuid AND c.status = 'link_submitted'
      AND l.platform IS NOT NULL
    ORDER BY c.deadline, c.id, l.submitted_at, l.created_at, l.id
    FOR SHARE OF l`);
}

const PLATFORMS: readonly unknown[] = Object.values(social_platform);
const STATES: readonly unknown[] = Object.values(link_data_state);
const SOURCES: readonly unknown[] = ['synced', 'manual', null];

function isCount(value: unknown): boolean {
  return (
    value === null || (Number.isSafeInteger(value) && (value as number) >= 0)
  );
}

/** Whether a stored entry is one Finalize writes (toFrozenLink), field by field. */
export function isFrozenLink(
  value: unknown,
): value is FrozenPerformanceLinkDto {
  if (typeof value !== 'object' || value === null) return false;
  const link = value as Record<string, unknown>;
  return (
    typeof link.contentId === 'string' &&
    typeof link.contentName === 'string' &&
    PLATFORMS.includes(link.platform) &&
    isCount(link.views) &&
    isCount(link.likes) &&
    isCount(link.comments) &&
    isCount(link.shares) &&
    SOURCES.includes(link.source) &&
    STATES.includes(link.state) &&
    (link.lastSyncedAt === null || typeof link.lastSyncedAt === 'string')
  );
}
