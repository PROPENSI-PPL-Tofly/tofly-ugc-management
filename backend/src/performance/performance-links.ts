import type {
  link_data_state,
  Prisma,
  social_platform,
} from '@prisma/client';
import { joinName } from '../creators/evergreen.js';
import { isSocialPlatform } from '../contents/link-rules.js';
import { SOCIAL_PLATFORMS } from '../creators/new-creator.js';
import { isOneOf, listOf, withoutUnset } from '../list-query.js';
import { isUuid } from '../uuid.js';
import {
  effectiveState,
  type LinkDataState,
  type LinkMetrics,
  type LinkPerformance,
} from './link-performance.js';

// The admin's "Performa Konten" list (PBI-27, AC 22-26) and the per-link numbers every reader
// shows (AC 19-20): which links, filtered how, and each one as the API answers it.

export interface PerformanceLinksQuery {
  creator?: unknown;
  platform?: unknown;
  state?: unknown;
}

export interface PerformanceLinksFilters {
  creators?: string[];
  platforms?: social_platform[];
  /** The states a row shows (Status Data), which is not always the one stored: stateFilter. */
  states?: LinkDataState[];
}

const DATA_STATES: readonly LinkDataState[] = [
  'waiting',
  'not_connected',
  'synced',
  'not_found',
  'sync_failed',
  'manual',
];

function isDataState(value: unknown): value is LinkDataState {
  return isOneOf(DATA_STATES, value);
}

/** Repeated values arrive as a list; every refused value is a 400 before any read (OWASP A05). */
export function checkPerformanceLinksQuery(
  query: PerformanceLinksQuery,
): PerformanceLinksFilters {
  return withoutUnset({
    creators: listOf(
      'creator',
      query.creator,
      isUuid,
      'creator must be a creator id',
    ),
    platforms: listOf(
      'platform',
      query.platform,
      isSocialPlatform,
      'platform must be instagram or tiktok',
    ),
    states: listOf(
      'state',
      query.state,
      isDataState,
      `state must be one of ${DATA_STATES.join(', ')}`,
    ),
  });
}

/** The account behind a link is connected as isConnected reads it: flagged and with a platform id. */
function accountOn(platform: social_platform): Prisma.social_accountsWhereInput {
  return { platform, is_connected: true, platform_user_id: { not: null } };
}

/**
 * The link's creator has (or has not) a connected account on the link's own platform. The
 * platform is repeated per branch because a where cannot compare two columns across a relation.
 */
function connection(
  connected: boolean,
): Prisma.content_linksWhereInput[] {
  return SOCIAL_PLATFORMS.map((platform) => ({
    platform,
    contents: {
      contracts: {
        creators: {
          social_accounts: connected
            ? { some: accountOn(platform) }
            : { none: accountOn(platform) },
        },
      },
    },
  }));
}

/**
 * Status Data as a where: the state a row shows is derived (effectiveState), so the filter
 * keeps its rule. A link shows Tersinkron or Menunggu only while its account is connected, and
 * Belum Terhubung only while it is not; the other three show as stored.
 */
export function stateFilter(
  states: readonly LinkDataState[],
): Prisma.content_linksWhereInput {
  return {
    OR: states.map((state): Prisma.content_linksWhereInput => {
      switch (state) {
        case 'synced':
          return { data_state: 'synced', OR: connection(true) };
        case 'waiting':
          return {
            data_state: { in: ['waiting', 'not_connected'] },
            OR: connection(true),
          };
        case 'not_connected':
          return {
            data_state: { in: ['waiting', 'synced', 'not_connected'] },
            OR: connection(false),
          };
        default:
          return { data_state: state };
      }
    }),
  };
}

/** The creator's accounts, only as far as whether each is connected. No token is read. */
export const CONNECTION_SELECT = {
  select: { platform: true, is_connected: true, platform_user_id: true },
} as const;

export interface AccountConnection {
  platform: social_platform;
  is_connected: boolean;
  platform_user_id: string | null;
}

/** A content_links row with the columns its numbers and state are read from. */
export interface StoredLinkPerformance extends LinkMetrics {
  platform: social_platform | null;
  url: string;
  data_state: link_data_state;
  last_synced_at: Date | null;
  manual_at: Date | null;
}

export const LINK_PERFORMANCE_SELECT = {
  platform: true,
  url: true,
  views: true,
  likes: true,
  comments: true,
  shares: true,
  data_state: true,
  last_synced_at: true,
  manual_at: true,
} as const;

export interface PerformanceLinkRow extends StoredLinkPerformance {
  id: string;
  contents: {
    id: string;
    name: string;
    contracts: {
      creators: {
        id: string;
        first_name: string;
        middle_name: string | null;
        last_name: string | null;
        social_accounts: AccountConnection[];
      };
    };
  };
}

export const PERFORMANCE_LINK_SELECT = {
  id: true,
  ...LINK_PERFORMANCE_SELECT,
  contents: {
    select: {
      id: true,
      name: true,
      contracts: {
        select: {
          creators: {
            select: {
              id: true,
              first_name: true,
              middle_name: true,
              last_name: true,
              social_accounts: CONNECTION_SELECT,
            },
          },
        },
      },
    },
  },
} as const;

/** Connected as connectionOf (PBI-19) reads it: the flag and a platform account behind it. */
export function isConnected(
  accounts: readonly AccountConnection[],
  platform: social_platform | null,
): boolean {
  return accounts.some(
    (account) =>
      account.platform === platform &&
      account.is_connected &&
      account.platform_user_id !== null,
  );
}

/** One link's numbers and state, given whether its creator's accounts are connected. */
export function performanceOf(
  link: StoredLinkPerformance,
  accounts: readonly AccountConnection[],
): LinkPerformance {
  return {
    platform: link.platform,
    url: link.url,
    views: link.views,
    likes: link.likes,
    comments: link.comments,
    shares: link.shares,
    state: effectiveState(
      link.data_state,
      isConnected(accounts, link.platform),
    ),
    lastSyncedAt: link.last_synced_at?.toISOString() ?? null,
    manualAt: link.manual_at?.toISOString() ?? null,
  };
}

export function linkPerformanceOf(row: PerformanceLinkRow): LinkPerformance {
  return performanceOf(row, row.contents.contracts.creators.social_accounts);
}

export interface PerformanceLinkItem extends LinkPerformance {
  linkId: string;
  /** The id Content Detail opens by (AC 25). */
  contentId: string;
  contentName: string;
  creatorId: string;
  creatorName: string;
}

export function toPerformanceLinkItem(
  row: PerformanceLinkRow,
): PerformanceLinkItem {
  const creator = row.contents.contracts.creators;
  return {
    linkId: row.id,
    contentId: row.contents.id,
    contentName: row.contents.name,
    creatorId: creator.id,
    creatorName: joinName(creator),
    ...linkPerformanceOf(row),
  };
}
