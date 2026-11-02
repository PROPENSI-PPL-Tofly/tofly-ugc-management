import { Inject, Injectable } from '@nestjs/common';
import type { link_data_state, social_platform } from '@prisma/client';
import { joinName } from '../creators/evergreen.js';
import type { Paging } from '../creators/paging.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CONNECTION_SELECT,
  type ConnectionRow,
} from './account-connections.js';
import {
  LINK_PERFORMANCE_SELECT,
  toLinkPerformance,
  type LinkPerformance,
} from './link-performance.mapper.js';
import type { PerformanceMetrics } from './manual-performance-input.js';
import type { PerformanceLinksFilters } from './performance-links-query.js';

/** One content_links row as the list reads it, with its content and creator. */
export interface PerformanceLinkRow extends PerformanceMetrics {
  id: string;
  platform: social_platform | null;
  url: string;
  data_state: link_data_state;
  last_synced_at: Date | null;
  manual_at: Date | null;
  contents: {
    id: string;
    name: string;
    contracts: {
      creators: {
        id: string;
        first_name: string;
        middle_name: string | null;
        last_name: string | null;
        social_accounts: (ConnectionRow & { platform: social_platform })[];
      };
    };
  };
}

/** One row of the Performa Konten list (PBI-27 AC 22), as #147's table reads it. */
export interface PerformanceLinkItem extends LinkPerformance {
  linkId: string;
  contentId: string;
  contentName: string;
  creatorId: string;
  creatorName: string;
  platform: social_platform | null;
  url: string;
}

export interface PerformanceLinksPage {
  items: PerformanceLinkItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PerformanceLinksClient {
  content_links: {
    findMany(args: unknown): Promise<PerformanceLinkRow[]>;
    count(args: unknown): Promise<number>;
  };
  $transaction<T extends readonly unknown[]>(batch: [...T]): Promise<unknown>;
}

/** Every column a list row needs, in the one query: never manual_by, never a token. */
const LINK_ROW_SELECT = {
  id: true,
  url: true,
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
              social_accounts: { select: CONNECTION_SELECT },
            },
          },
        },
      },
    },
  },
} as const;

/** Newest hand-in first; the creation time and the id settle ties, so a page never shifts. */
const NEWEST_FIRST = [
  { submitted_at: 'desc' },
  { created_at: 'desc' },
  { id: 'desc' },
] as const;

/** Submitted links with a platform, narrowed in the query itself (AC 22-23). */
function whereOf({ creators, platforms }: PerformanceLinksFilters) {
  return {
    platform: platforms ? { in: platforms } : { not: null },
    contents: {
      status: 'link_submitted',
      ...(creators && { contracts: { creator_id: { in: creators } } }),
    },
  } as const;
}

function toItem(row: PerformanceLinkRow): PerformanceLinkItem {
  const creator = row.contents.contracts.creators;
  const account = creator.social_accounts.find(
    (candidate) => candidate.platform === row.platform,
  );
  return {
    linkId: row.id,
    contentId: row.contents.id,
    contentName: row.contents.name,
    creatorId: creator.id,
    creatorName: joinName(creator),
    platform: row.platform,
    url: row.url,
    // Every listed link has a platform (whereOf), so it always has a performance.
    ...toLinkPerformance(row, account)!,
  };
}

/**
 * The Performa Konten list (PBI-27 AC 22-26): one page of submitted video links with their
 * numbers and state. Filtering, ordering and paging all happen in PostgreSQL, in one query and
 * one count batched together, so no request reads more rows than its page.
 */
@Injectable()
export class PerformanceLinksService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PerformanceLinksClient,
  ) {}

  async list(
    { page, pageSize }: Paging,
    filters: PerformanceLinksFilters,
  ): Promise<PerformanceLinksPage> {
    const where = whereOf(filters);
    const [rows, total] = (await this.prisma.$transaction([
      this.prisma.content_links.findMany({
        where,
        orderBy: NEWEST_FIRST,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: LINK_ROW_SELECT,
      }),
      this.prisma.content_links.count({ where }),
    ])) as [PerformanceLinkRow[], number];

    return {
      items: rows.map(toItem),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }
}
