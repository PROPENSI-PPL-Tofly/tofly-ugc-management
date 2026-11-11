import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Paging } from '../creators/paging.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  PERFORMANCE_LINK_SELECT,
  toPerformanceLinkItem,
  type PerformanceLinkItem,
  type PerformanceLinkRow,
  type PerformanceLinksFilters,
} from './performance-links.js';

export interface PerformanceLinksPage {
  items: PerformanceLinkItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** The slice of Prisma this service touches, so tests stub exactly that. */
export interface PerformanceLinksClient {
  content_links: {
    count(args: { where: Prisma.content_linksWhereInput }): Promise<number>;
    findMany(args: {
      where: Prisma.content_linksWhereInput;
      select: typeof PERFORMANCE_LINK_SELECT;
      orderBy: Prisma.content_linksOrderByWithRelationInput[];
      skip: number;
      take: number;
    }): Promise<PerformanceLinkRow[]>;
  };
}

const CREATOR_NAME_PARTS = ['first_name', 'middle_name', 'last_name'] as const;

/**
 * One searched word (I3.2): in the content's name or in any part of the creator's, whatever the
 * case. Every word must match, so "rani kopi" finds Rani's "Review Kopi" and a full name split
 * across first and last name still finds its creator. Searched in the database, so the count and
 * the page are the search's own. Prisma sends the word as a parameter, with % and _ escaped.
 */
function wordMatch(word: string): Prisma.content_linksWhereInput {
  const contains = { contains: word, mode: 'insensitive' } as const;
  return {
    OR: [
      { contents: { name: contains } },
      ...CREATOR_NAME_PARTS.map((part) => ({
        contents: { contracts: { creators: { [part]: contains } } },
      })),
    ],
  };
}

/**
 * Every submitted Instagram or TikTok link, newest first (PBI-27, AC 22-23). A link kept from
 * before platforms were recorded has no platform to be measured on, so it is not listed.
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
    const where: Prisma.content_linksWhereInput = {
      platform: filters.platforms ? { in: filters.platforms } : { not: null },
      ...(filters.creators && {
        contents: { contracts: { creator_id: { in: filters.creators } } },
      }),
      ...(filters.q && { AND: filters.q.split(/\s+/).map(wordMatch) }),
    };
    const [total, rows] = await Promise.all([
      this.prisma.content_links.count({ where }),
      this.prisma.content_links.findMany({
        where,
        select: PERFORMANCE_LINK_SELECT,
        orderBy: [
          { submitted_at: 'desc' },
          { created_at: 'desc' },
          { id: 'asc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      items: rows.map(toPerformanceLinkItem),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }
}
