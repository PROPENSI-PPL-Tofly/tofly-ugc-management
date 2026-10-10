import { Inject, Injectable } from '@nestjs/common';
import type { content_status, content_type } from '@prisma/client';
import { COMMITTED_STATUSES } from '../contents/content-lifecycle.js';
import { jakartaDay } from '../creators/evergreen.js';
import type { Paging } from '../creators/paging.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  MyContentItem,
  MyContentsResponse,
} from './dto/my-contents.dto.js';
import { pageAcrossSegments, type Slice } from './page-segments.js';
import { taskActions } from './task-actions.js';
import { statusesFor, type TaskStatusFilter } from './task-status-filter.js';

// Only what a row and its modals show. Selecting columns (rather than whole rows) keeps
// performance numbers, video links and anything added later out of the response by construction.
const MY_CONTENT_SELECT = {
  id: true,
  name: true,
  type: true,
  brief: true,
  deadline: true,
  status: true,
  // Only the latest hand-in: its revision_notes are what the admin asked to change.
  submissions: {
    select: { revision_notes: true },
    orderBy: { created_at: 'desc' },
    take: 1,
  },
} as const;

// Nearest deadline first, then name and id so rows sharing a deadline keep their place from one
// page to the next. Open and finished work are read as two segments with this same order, so
// the finished tasks sit after every open one and are themselves in deadline order too.
const MY_CONTENT_ORDER = [
  { deadline: 'asc' },
  { name: 'asc' },
  { id: 'asc' },
] as const;

export interface MyContentRow {
  id: string;
  name: string;
  type: content_type;
  brief: string;
  deadline: Date;
  status: content_status;
  submissions: { revision_notes: string | null }[];
}

interface MyContentsWhere {
  contracts: { creator_id: string };
  // Always named: without a filter it is every committed status, so a pending proposal, which
  // is not assigned work yet, never reaches Task Saya.
  status: { in: content_status[] };
  // Only a submitted link has video_submitted_at (the video endpoint sets both together with
  // link_submitted), so this is what tells finished work from open work.
  video_submitted_at?: null | { not: null };
}

/** One page of the list, optionally narrowed to a Task Saya status. */
export interface MyContentsQuery extends Paging {
  status?: TaskStatusFilter;
}

/** The slice of Prisma this service touches, so tests can stub exactly that. */
export interface MyContentsClient {
  contents: {
    findMany: (args: {
      where: MyContentsWhere;
      select: typeof MY_CONTENT_SELECT;
      orderBy: typeof MY_CONTENT_ORDER;
      skip: number;
      take: number;
    }) => Promise<MyContentRow[]>;
    count: (args: { where: MyContentsWhere }) => Promise<number>;
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

@Injectable()
export class MyContentsService implements MyContentsLister {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: MyContentsClient,
  ) {}

  // Sorting and paging run in the query, so a request reads only the rows of its page however
  // many contents the creator holds. Open work comes first, then finished work, each by nearest
  // deadline: two ordered segments, with the page cut across them.
  async list(
    creatorId: string,
    query: MyContentsQuery,
    now: Date,
  ): Promise<MyContentsResponse> {
    const { page, pageSize, status } = query;
    const where: MyContentsWhere = {
      contracts: { creator_id: creatorId },
      status: { in: status ? statusesFor(status) : [...COMMITTED_STATUSES] },
    };
    const open: MyContentsWhere = { ...where, video_submitted_at: null };
    const finished: MyContentsWhere = {
      ...where,
      video_submitted_at: { not: null },
    };

    const [openTotal, finishedTotal] = await Promise.all([
      this.prisma.contents.count({ where: open }),
      this.prisma.contents.count({ where: finished }),
    ]);
    const slices = pageAcrossSegments(
      (page - 1) * pageSize,
      pageSize,
      openTotal,
    );

    const [openRows, finishedRows] = await Promise.all([
      this.read(open, slices.first),
      this.read(finished, slices.second, finishedTotal),
    ]);

    const today = jakartaDay(now);
    const total = openTotal + finishedTotal;

    return {
      items: [...openRows, ...finishedRows].map((row) =>
        this.toItem(row, today),
      ),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /** One segment's share of the page; no query when it has none, or nothing is left there. */
  private async read(
    where: MyContentsWhere,
    slice: Slice | null,
    available = Number.POSITIVE_INFINITY,
  ): Promise<MyContentRow[]> {
    if (slice === null || slice.skip >= available) {
      return [];
    }
    return this.prisma.contents.findMany({
      where,
      select: MY_CONTENT_SELECT,
      orderBy: MY_CONTENT_ORDER,
      skip: slice.skip,
      take: slice.take,
    });
  }

  private toItem(row: MyContentRow, today: string): MyContentItem {
    // Postgres `date` arrives as midnight UTC, so the ISO day is its first ten characters.
    const deadline = row.deadline.toISOString().slice(0, 10);
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      brief: row.brief,
      deadline,
      status: row.status,
      actions: taskActions(row.status, deadline, today),
      // Stale once the revision is handed in, so only a row awaiting a resubmit carries them.
      revisionNotes:
        row.status === 'draft_revision'
          ? (row.submissions[0]?.revision_notes ?? null)
          : null,
    };
  }
}
