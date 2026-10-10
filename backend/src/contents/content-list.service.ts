import { Inject, Injectable } from '@nestjs/common';
import { joinName } from '../creators/evergreen.js';
import type { Paging } from '../creators/paging.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ContentStatus } from './content-lifecycle.js';
import {
  tabOf,
  type ContentListFilters,
  type ContentListSort,
  type ContentListTab,
  type ContentListType,
} from './content-list.js';
import { contentTags } from './content-tags.js';
import type {
  ContentListItem,
  ContentListResponse,
} from './dto/content-list.dto.js';

// Only what the table shows and what its tags are judged on. Selecting columns (rather than
// whole rows) keeps briefs, video links, contact details and OAuth tokens out of the response
// by construction.
const CONTENT_LIST_SELECT = {
  id: true,
  name: true,
  type: true,
  deadline: true,
  status: true,
  video_submitted_at: true,
  approval_bypassed: true,
  contracts: {
    select: {
      creators: {
        select: {
          id: true,
          first_name: true,
          middle_name: true,
          last_name: true,
        },
      },
    },
  },
  // Only the latest hand-in, in the order approve picks it: its time decides a late draft.
  submissions: {
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    take: 1,
    select: { created_at: true },
  },
  // Every hand-in, not just the latest: each one after the first is a revision.
  _count: { select: { submissions: true } },
} as const;

export interface ContentListRow {
  id: string;
  name: string;
  type: ContentListType;
  deadline: Date;
  status: ContentStatus;
  video_submitted_at: Date | null;
  approval_bypassed: boolean;
  contracts: {
    creators: {
      id: string;
      first_name: string;
      middle_name: string | null;
      last_name: string | null;
    };
  };
  submissions: { created_at: Date }[];
  _count: { submissions: number };
}

/** The slice of Prisma this service touches, so tests can stub exactly that. */
export interface ContentListClient {
  contents: {
    findMany: (args: {
      select: typeof CONTENT_LIST_SELECT;
    }) => Promise<ContentListRow[]>;
  };
}

/** What the controller needs from the service, so it can be swapped or stubbed by contract. */
export interface ContentListLister {
  list(
    paging: Paging,
    now: Date,
    filters: ContentListFilters,
  ): Promise<ContentListResponse>;
}

// Names are compared by one fixed collator, so the order is the same on a laptop, in CI and on
// the server whatever locale each of them runs in.
// Stryker disable next-line StringLiteral: not a gap. An empty locale makes the constructor throw while this file loads, so every suite that imports it fails before a test runs, and the runner counts a mutant with no failed test as survived.
const BY_NAME = new Intl.Collator('id');

/** ISO days and ids are plain ASCII, so their code-unit order is their order. */
function compareText(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}

/** Nearest or furthest deadline first; name and id keep rows sharing a day in place. */
function compareBy(sort: ContentListSort) {
  const direction = sort === 'deadline_desc' ? -1 : 1;
  return (a: ContentListItem, b: ContentListItem): number =>
    direction * compareText(a.deadline, b.deadline) ||
    BY_NAME.compare(a.name, b.name) ||
    compareText(a.id, b.id);
}

/** Decides whether a row passes the search and filters, with what never changes worked out once. */
function matcher(filters: ContentListFilters) {
  const { types, statuses, overdue, deadlineFrom, deadlineTo } = filters;
  const creators = filters.creators && new Set(filters.creators);
  const needle = filters.q?.toLowerCase();

  return (item: ContentListItem): boolean => {
    if (creators && !creators.has(item.creatorId)) {
      return false;
    }
    if (types && !types.includes(item.type)) {
      return false;
    }
    if (statuses && !statuses.includes(item.status)) {
      return false;
    }
    if (overdue && !item.tags.includes('overdue')) {
      return false;
    }
    // ISO days order the same as text and as dates.
    if (deadlineFrom && item.deadline < deadlineFrom) {
      return false;
    }
    if (deadlineTo && item.deadline > deadlineTo) {
      return false;
    }
    if (!needle) {
      return true;
    }
    return (
      item.name.toLowerCase().includes(needle) ||
      item.creatorName.toLowerCase().includes(needle)
    );
  };
}

@Injectable()
export class ContentListService implements ContentListLister {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: ContentListClient,
  ) {}

  // A contract cycle holds about 180 contents, so the list is read once and then filtered,
  // counted, sorted and paged in memory. The overdue filter and the creator-name search are
  // judged on the very tags and name a row shows, so a filter can never disagree with its row.
  // The tab is applied after the counting: every counter is the size of its tab under the same
  // search and filters, whichever tab is open.
  async list(
    paging: Paging,
    now: Date,
    filters: ContentListFilters,
  ): Promise<ContentListResponse> {
    const rows = await this.prisma.contents.findMany({
      select: CONTENT_LIST_SELECT,
    });

    const matches = matcher(filters);
    const tabCounts: Record<ContentListTab, number> = {
      all: 0,
      needs_approval: 0,
      waiting_creator: 0,
      done: 0,
    };
    const listed: ContentListItem[] = [];

    // One pass: a matching row is counted under Semua and under its own tab, and kept when
    // the open tab is one of those two.
    for (const row of rows) {
      const item = this.toItem(row, now);
      if (!matches(item)) {
        continue;
      }
      const tab = tabOf(item.status);
      tabCounts.all += 1;
      tabCounts[tab] += 1;
      if (filters.tab === 'all' || filters.tab === tab) {
        listed.push(item);
      }
    }
    listed.sort(compareBy(filters.sort));

    const { page, pageSize } = paging;
    const start = (page - 1) * pageSize;

    return {
      items: listed.slice(start, start + pageSize),
      page,
      pageSize,
      total: listed.length,
      totalPages: Math.max(1, Math.ceil(listed.length / pageSize)),
      tabCounts,
    };
  }

  private toItem(row: ContentListRow, now: Date): ContentListItem {
    const creator = row.contracts.creators;
    return {
      id: row.id,
      name: row.name,
      creatorId: creator.id,
      creatorName: joinName(creator),
      type: row.type,
      // Postgres `date` arrives as midnight UTC, so the ISO day is its first ten characters.
      deadline: row.deadline.toISOString().slice(0, 10),
      status: row.status,
      tags: contentTags(
        {
          deadline: row.deadline,
          status: row.status,
          videoSubmittedAt: row.video_submitted_at,
          latestDraftAt: row.submissions[0]?.created_at ?? null,
          approvalBypassed: row.approval_bypassed,
        },
        now,
      ),
      // A content nobody has handed a draft in for has no revisions, not minus one.
      revisionCount: Math.max(0, row._count.submissions - 1),
    };
  }
}
