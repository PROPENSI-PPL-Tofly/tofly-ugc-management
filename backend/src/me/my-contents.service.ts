import { Inject, Injectable } from '@nestjs/common';
import type {
  content_status,
  content_type,
  social_platform,
} from '@prisma/client';
import { linkPlatforms } from '../contents/content-links.js';
import type { ContentListType } from '../contents/content-list.js';
import { contentTags, type ContentTag } from '../contents/content-tags.js';
import {
  asDate,
  compareByDeadline,
  deadlineWhere,
  isOverdue,
  withinPeriod,
} from '../contents/list-rows.js';
import { jakartaDay } from '../creators/evergreen.js';
import type { Paging } from '../creators/paging.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  MyContentItem,
  MyContentsResponse,
} from './dto/my-contents.dto.js';
import {
  MY_TASK_TAB_STATUSES,
  PERIOD_FREE_MY_TAB,
  myTabOf,
  type MyStatusTab,
  type MyTaskFilters,
  type MyTaskStatus,
  type MyTaskTab,
} from './my-task-query.js';
import { lastGraceDeadline, taskActions } from './task-actions.js';

// Only what a row and its modals show. Selecting columns (rather than whole rows) keeps
// performance numbers, video links and anything added later out of the response by construction.
const MY_CONTENT_SELECT = {
  id: true,
  name: true,
  type: true,
  brief: true,
  deadline: true,
  status: true,
  // What the row's tags are judged on (content-tags.ts), never shown themselves.
  video_submitted_at: true,
  approval_bypassed: true,
  // Only which platforms have a link, for the row's icons (PBI-38 AC 13), never the links.
  content_links: { select: { platform: true } },
  // Only the latest hand-in: its revision_notes are what the admin asked to change, and its time
  // decides a late draft.
  submissions: {
    select: { revision_notes: true, created_at: true },
    orderBy: { created_at: 'desc' },
    take: 1,
  },
} as const;

export interface MyContentRow {
  id: string;
  name: string;
  type: content_type;
  brief: string;
  deadline: Date;
  status: content_status;
  video_submitted_at: Date | null;
  approval_bypassed: boolean;
  content_links: { platform: social_platform | null }[];
  submissions: { revision_notes: string | null; created_at: Date }[];
}

interface DeadlineRange {
  gte?: Date;
  lte?: Date;
}

interface MyContentsWhere {
  contracts: { creator_id: string };
  // Always named: a pending proposal, which is not assigned work yet, never reaches Task Saya.
  status: { in: MyTaskStatus[] };
  type?: { in: ContentListType[] };
  OR?: [
    { deadline: DeadlineRange },
    { status: { in: MyTaskStatus[] } },
    { status: MyTaskStatus; deadline: DeadlineRange },
  ];
}

/** One page of the list, under the tab, filters and sort the query asked for. */
export type MyContentsQuery = Paging & MyTaskFilters;

/** The slice of Prisma this service touches, so tests can stub exactly that. */
export interface MyContentsClient {
  contents: {
    findMany: (args: {
      where: MyContentsWhere;
      select: typeof MY_CONTENT_SELECT;
    }) => Promise<MyContentRow[]>;
  };
}

/** What the controller needs from the service, so it can be swapped or stubbed by contract. */
export interface MyContentsLister {
  list(
    creatorId: string,
    query: MyContentsQuery,
    now: Date,
  ): Promise<MyContentsResponse>;
}

/** The tags a row shows, judged the same way the admin's list judges them. */
function tagsOf(row: MyContentRow, now: Date): ContentTag[] {
  return contentTags(
    {
      deadline: row.deadline,
      status: row.status,
      videoSubmittedAt: row.video_submitted_at,
      latestDraftAt: row.submissions[0]?.created_at ?? null,
      approvalBypassed: row.approval_bypassed,
    },
    now,
  );
}

/**
 * Whose turn a row is. A button waiting for the creator makes it theirs: a draft still in review
 * joins Perlu Dikerjakan once its H-1 link can be sent, since from then on the creator can
 * finish the content without the admin. Every other row follows its status.
 */
function tabOf(item: MyContentItem): MyStatusTab {
  return item.actions.length > 0 ? 'to_do' : myTabOf(item.status);
}

/** Finished work: nothing is left for anyone to do on it. */
function isDone(item: MyContentItem): boolean {
  return MY_TASK_TAB_STATUSES.done.includes(item.status);
}

/**
 * Open work first, then finished work, each block by deadline in the order asked. Finished
 * work holds the oldest deadlines, so sorted in with the rest it would fill the first page of
 * Semua and push what the creator still has to deliver behind it. The other tabs hold one block
 * each, so for them this is the deadline order alone.
 */
function openFirst(sort: MyTaskFilters['sort']) {
  const byDeadline = compareByDeadline(sort);
  return (a: MyContentItem, b: MyContentItem): number =>
    Number(isDone(a)) - Number(isDone(b)) || byDeadline(a, b);
}

/**
 * What the query itself narrows by: the creator's own committed work, its type and its deadline
 * period. The period keeps everything Perlu Dikerjakan can hold whatever its deadline, because
 * that tab is never narrowed by it: its statuses, and a draft in review whose H-1 link is open
 * today. Which rows the period then leaves in each tab is decided row by row in list().
 */
function narrowing(
  creatorId: string,
  filters: MyTaskFilters,
  today: string,
): MyContentsWhere {
  const where: MyContentsWhere = {
    contracts: { creator_id: creatorId },
    status: { in: [...MY_TASK_TAB_STATUSES.all] },
  };
  if (filters.types) {
    where.type = { in: filters.types };
  }
  const deadline = deadlineWhere(filters);
  if (deadline) {
    where.OR = [
      { deadline },
      { status: { in: [...MY_TASK_TAB_STATUSES[PERIOD_FREE_MY_TAB]] } },
      {
        status: 'draft_review',
        deadline: { lte: asDate(lastGraceDeadline(today)) },
      },
    ];
  }
  return where;
}

/** Whether a row passes the search and the overdue filter, judged on what the row shows. */
function matcher(filters: MyTaskFilters) {
  const { overdue } = filters;
  const needle = filters.q?.toLowerCase();

  return (item: MyContentItem): boolean =>
    (overdue === undefined || isOverdue(item.tags) === overdue) &&
    (!needle || item.name.toLowerCase().includes(needle));
}

@Injectable()
export class MyContentsService implements MyContentsLister {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: MyContentsClient,
  ) {}

  // The query narrows by owner, type and period; what it returns is then searched, counted,
  // sorted (open work ahead of finished) and paged in memory, the way the admin Content Plan
  // does it. A creator holds at most
  // a contract's worth of contents, so the read stays small, and the overdue filter is judged on
  // the very tags a row shows, so a filter can never disagree with its row.
  //
  // Each counter is the size of its tab under the search and the type, overdue and period
  // filters, whichever tab is open. The status filter only narrows the rows, and the period
  // never applies to Perlu Dikerjakan. A row is on one tab besides Semua: the one tabOf names.
  async list(
    creatorId: string,
    query: MyContentsQuery,
    now: Date,
  ): Promise<MyContentsResponse> {
    const today = jakartaDay(now);
    const rows = await this.prisma.contents.findMany({
      where: narrowing(creatorId, query, today),
      select: MY_CONTENT_SELECT,
    });

    const matches = matcher(query);
    const inPeriod = withinPeriod(query);
    const { statuses } = query;
    const tabCounts: Record<MyTaskTab, number> = {
      all: 0,
      to_do: 0,
      waiting_admin: 0,
      done: 0,
    };
    const listed: MyContentItem[] = [];

    for (const row of rows) {
      const item = this.toItem(row, today, tagsOf(row, now));
      if (!matches(item)) {
        continue;
      }
      const tab = tabOf(item);
      const dated = inPeriod(item.deadline);
      // Semua holds a row only inside the period; the row's own tab also holds it outside the
      // period when that tab is Perlu Dikerjakan.
      const inOwnTab = dated || tab === PERIOD_FREE_MY_TAB;
      if (dated) {
        tabCounts.all += 1;
      }
      if (inOwnTab) {
        tabCounts[tab] += 1;
      }
      const shown = query.tab === 'all' ? dated : query.tab === tab && inOwnTab;
      if (shown && (!statuses || statuses.includes(item.status))) {
        listed.push(item);
      }
    }
    listed.sort(openFirst(query.sort));

    const { page, pageSize } = query;
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

  private toItem(
    row: MyContentRow,
    today: string,
    tags: ContentTag[],
  ): MyContentItem {
    // Postgres `date` arrives as midnight UTC, so the ISO day is its first ten characters.
    const deadline = row.deadline.toISOString().slice(0, 10);
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      brief: row.brief,
      deadline,
      status: row.status as MyTaskStatus,
      tags,
      actions: taskActions(row.status, deadline, today),
      // Stale once the revision is handed in, so only a row awaiting a resubmit carries them.
      revisionNotes:
        row.status === 'draft_revision'
          ? (row.submissions[0]?.revision_notes ?? null)
          : null,
      platforms: linkPlatforms(row.content_links),
    };
  }
}
