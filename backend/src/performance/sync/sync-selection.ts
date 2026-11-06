import type {
  content_status,
  invoice_status,
  link_data_state,
  Prisma,
  social_platform,
} from '@prisma/client';
import type { PerformanceMetrics, SourceLink } from '../ports.js';

// Which links a performance sync reads (PBI-27, 27.4), without Prisma or a clock, so the daily
// run, "Sinkronkan Sekarang" and Finalize's last sync agree on one rule.

/** Every link, one content's ("Sinkronkan", AC 12) or one contract's (the last sync before Finalize). */
export type SyncScope =
  | { kind: 'all' }
  | { kind: 'content'; contentId: string }
  | { kind: 'contract'; contractId: string };

/** The columns a sync reads per link. No token: the sources open their own accounts. */
export const SYNC_LINK_SELECT = {
  id: true,
  url: true,
  platform: true,
  data_state: true,
  views: true,
  likes: true,
  comments: true,
  shares: true,
  content_id: true,
  contents: { select: { contracts: { select: { creator_id: true } } } },
} as const;

export interface SyncLinkRow extends PerformanceMetrics {
  id: string;
  url: string;
  platform: social_platform | null;
  data_state: link_data_state;
  content_id: string;
  contents: { contracts: { creator_id: string } };
}

// An invoice that is not running is frozen, and a contract without an invoice row yet is running,
// as the invoice pipeline reads it (AC 5).
const RUNNING_INVOICE = {
  OR: [{ invoice: { is: null } }, { invoice: { is: { status: 'running' } } }],
} satisfies Prisma.contractsWhereInput;

/** The links of "Link Dikirim" content whose invoice still runs, each with a platform (AC 4, 5). */
export function syncableLinks(
  scope: SyncScope,
): Prisma.content_linksWhereInput {
  return {
    platform: { not: null },
    contents: {
      status: 'link_submitted',
      ...(scope.kind === 'content' && { id: scope.contentId }),
      contracts: {
        ...RUNNING_INVOICE,
        ...(scope.kind === 'contract' && { id: scope.contractId }),
      },
    },
  };
}

/** What decides whether one content may be synced, for a refusal that names why. */
export interface SyncableContent {
  status: content_status;
  contracts: { invoice: { status: invoice_status } | null };
}

/** The same rule as syncableLinks, for one content already read. */
export function canSync(content: SyncableContent): boolean {
  const invoice = content.contracts.invoice;
  return (
    content.status === 'link_submitted' &&
    (invoice === null || invoice.status === 'running')
  );
}

/** One link as a sync hands it to a source, with what the result is written against. */
export interface SyncGroupLink extends SourceLink {
  contentId: string;
  platform: social_platform;
  storedState: link_data_state;
  /** What the link holds now, so a replaced manual entry can be recorded with its old values. */
  storedMetrics: PerformanceMetrics;
}

/** Every link one creator has on one platform: one source call reads them all. */
export interface SyncGroup {
  creatorId: string;
  platform: social_platform;
  links: SyncGroupLink[];
}

/**
 * Links grouped by creator and platform, so a platform lists a creator's media or batches the
 * ids once rather than once per link (performance: one call per account, not per link).
 */
export function groupLinks(rows: readonly SyncLinkRow[]): SyncGroup[] {
  const groups = new Map<string, SyncGroup>();
  for (const row of rows) {
    // syncableLinks already leaves these out; the type cannot know it.
    if (row.platform === null) continue;
    const creatorId = row.contents.contracts.creator_id;
    const key = `${creatorId}:${row.platform}`;
    let group = groups.get(key);
    if (group === undefined) {
      group = { creatorId, platform: row.platform, links: [] };
      groups.set(key, group);
    }
    group.links.push({
      id: row.id,
      url: row.url,
      contentId: row.content_id,
      platform: row.platform,
      storedState: row.data_state,
      storedMetrics: {
        views: row.views,
        likes: row.likes,
        comments: row.comments,
        shares: row.shares,
      },
    });
  }
  return [...groups.values()];
}
