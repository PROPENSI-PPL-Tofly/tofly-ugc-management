import { Inject, Injectable } from '@nestjs/common';
import { joinName } from '../creators/evergreen.js';
import type { Paging } from '../creators/paging.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ContentStatus } from './content-lifecycle.js';
import {
  CONTENT_LIST_TABS,
  TAB_STATUSES,
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

/** Nearest or furthest deadline first; name and id keep rows sharing a day in place. */
function compareBy(sort: ContentListSort) {
  const direction = sort === 'deadline_desc' ? -1 : 1;
  return (a: ContentListItem, b: ContentListItem): number =>
    direction * a.deadline.localeCompare(b.deadline) ||
    a.name.localeCompare(b.name) ||
    a.id.localeCompare(b.id);
}

function inTab(tab: ContentListTab, item: ContentListItem): boolean {
  return TAB_STATUSES[tab].includes(item.status);
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

    const matching = rows
      .map((row) => this.toItem(row, now))
      .filter((item) => this.matches(item, filters));

    const tabCounts = Object.fromEntries(
      CONTENT_LIST_TABS.map((tab) => [
        tab,
        matching.filter((item) => inTab(tab, item)).length,
      ]),
    ) as Record<ContentListTab, number>;

    const listed = matching
      .filter((item) => inTab(filters.tab, item))
      .sort(compareBy(filters.sort));

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

  private matches(item: ContentListItem, filters: ContentListFilters): boolean {
    const { q, creators, types, statuses, overdue, deadlineFrom, deadlineTo } =
      filters;
    if (creators && !creators.includes(item.creatorId)) {
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
    if (!q) {
      return true;
    }
    const needle = q.toLowerCase();
    return (
      item.name.toLowerCase().includes(needle) ||
      item.creatorName.toLowerCase().includes(needle)
    );
  }
}
