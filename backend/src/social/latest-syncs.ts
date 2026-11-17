import { Prisma } from '@prisma/client';

/** The one call this reads through, so tests stub exactly that. */
export interface LatestSyncClient {
  $queryRaw(query: Prisma.Sql): Promise<unknown>;
}

interface LatestSyncRow {
  creator_id: string;
  platform: string;
  last_sync: Date;
}

/** When each creator's links on each platform last synced, keyed by syncKey. */
export type LatestSyncs = ReadonlyMap<string, Date>;

export function syncKey(creatorId: string, platform: string): string {
  return `${creatorId}:${platform}`;
}

/**
 * The latest sync per creator and platform, in one query however many creators a page holds.
 * Read from the links rather than stored on the account, so it can never disagree with them.
 */
export async function latestSyncs(
  client: LatestSyncClient,
  creatorIds: readonly string[],
): Promise<LatestSyncs> {
  if (creatorIds.length === 0) {
    return new Map();
  }
  const rows = (await client.$queryRaw(Prisma.sql`
    select contracts.creator_id, content_links.platform::text as platform,
           max(content_links.last_synced_at) as last_sync
    from content_links
    join contents on contents.id = content_links.content_id
    join contracts on contracts.id = contents.contract_id
    where contracts.creator_id = any(${creatorIds}::uuid[])
      and content_links.last_synced_at is not null
      and content_links.platform is not null
    group by contracts.creator_id, content_links.platform
  `)) as LatestSyncRow[];
  return new Map(
    rows.map((row) => [syncKey(row.creator_id, row.platform), row.last_sync]),
  );
}
