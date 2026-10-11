import { Inject, Injectable } from '@nestjs/common';
import { joinName } from '../creators/evergreen.js';
import type { Paging } from '../creators/paging.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ContentStatus } from './content-lifecycle.js';
import {
  PERIOD_FREE_TAB,
  TAB_STATUSES,
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
  // A revision request is the note an admin leaves on a hand-in, the same fact the detail
  // panel's timeline reads, so only the hand-ins carrying one are counted.
  _count: {
    select: { submissions: { where: { revision_notes: { not: null } } } },
  },
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
  /** Hand-ins an admin answered with a revision request. */
  _count: { submissions: number };
}

interface DeadlineRange {
  gte?: Date;
  lte?: Date;
}

/** The filters the database can decide by itself, on columns it can index. */
export interface ContentListWhere {
  contracts?: { creator_id: { in: string[] } };
  type?: { in: ContentListType[] };
  OR?: [{ deadline: DeadlineRange }, { status: { in: ContentStatus[] } }];
}

/** The slice of Prisma this service touches, so tests can stub exactly that. */
export interface ContentListClient {
  contents: {
    findMany: (args: {
      where: ContentListWhere;
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

/** Past its deadline with no link yet, or finished after it: both read as overdue to an admin. */
function isOverdue(item: ContentListItem): boolean {
  return item.tags.includes('overdue') || item.tags.includes('late_submission');
}

/**
 * Decides whether a row passes the search and the overdue filter, the two that are judged on
 * what a row shows (its joined creator name, its tags) and so cannot be asked of the database.
 * The status filter and the period are not here: the first narrows the rows without touching a
 * counter, the second leaves one tab alone.
 */
function matcher(filters: ContentListFilters) {
  const { overdue } = filters;
  const needle = filters.q?.toLowerCase();

  return (item: ContentListItem): boolean => {
    if (overdue !== undefined && isOverdue(item) !== overdue) {
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

/** A calendar day as Postgres `date` columns hold it: midnight UTC. */
function asDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/**
 * What the query itself narrows by: creator, type and deadline period. The period keeps every
 * status of Perlu Approval whatever its deadline, because that tab is never narrowed by it;
 * which rows the period then leaves in each tab is decided row by row in list().
 */
function narrowing(filters: ContentListFilters): ContentListWhere {
  const { creators, types, deadlineFrom, deadlineTo } = filters;
  const where: ContentListWhere = {};
  if (creators) {
    where.contracts = { creator_id: { in: creators } };
  }
  if (types) {
    where.type = { in: types };
  }
  if (deadlineFrom || deadlineTo) {
    const deadline: DeadlineRange = {};
    if (deadlineFrom) {
      deadline.gte = asDate(deadlineFrom);
    }
    if (deadlineTo) {
      deadline.lte = asDate(deadlineTo);
    }
    where.OR = [
      { deadline },
      { status: { in: [...TAB_STATUSES[PERIOD_FREE_TAB]] } },
    ];
  }
  return where;
}

/** Whether a deadline falls inside the asked period; always, when none is asked. */
function withinPeriod(filters: ContentListFilters) {
  const { deadlineFrom, deadlineTo } = filters;
  // ISO days order the same as text and as dates.
  return (item: ContentListItem): boolean =>
    !(deadlineFrom && item.deadline < deadlineFrom) &&
    !(deadlineTo && item.deadline > deadlineTo);
}

@Injectable()
export class ContentListService implements ContentListLister {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: ContentListClient,
  ) {}

  // The query narrows by creator, type and period; what it returns is then searched, counted,
  // sorted and paged in memory. The overdue filter and the creator-name search are judged on
  // the very tags and name a row shows, so a filter can never disagree with its row.
  //
  // The counters follow the prototype: each is the size of its tab under the search and the
  // creator, type, overdue and period filters, whichever tab is open. The status filter only
  // narrows the rows, and the period never applies to Perlu Approval.
  async list(
    paging: Paging,
    now: Date,
    filters: ContentListFilters,
  ): Promise<ContentListResponse> {
    const rows = await this.prisma.contents.findMany({
      where: narrowing(filters),
      select: CONTENT_LIST_SELECT,
    });

    const matches = matcher(filters);
    const inPeriod = withinPeriod(filters);
    const { statuses } = filters;
    const tabCounts: Record<ContentListTab, number> = {
      all: 0,
      needs_approval: 0,
      waiting_creator: 0,
      done: 0,
    };
    const listed: ContentListItem[] = [];

    for (const row of rows) {
      const item = this.toItem(row, now);
      if (!matches(item)) {
        continue;
      }
      const tab = tabOf(item.status);
      const dated = inPeriod(item);
      // Semua holds a row only inside the period; the row's own tab also holds it outside the
      // period when that tab is Perlu Approval.
      const inOwnTab = dated || tab === PERIOD_FREE_TAB;
      if (dated) {
        tabCounts.all += 1;
      }
      if (inOwnTab) {
        tabCounts[tab] += 1;
      }
      const shown =
        filters.tab === 'all' ? dated : filters.tab === tab && inOwnTab;
      if (shown && (!statuses || statuses.includes(item.status))) {
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
      revisionCount: row._count.submissions,
    };
  }
}
