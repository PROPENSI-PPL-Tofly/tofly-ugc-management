import { Inject, Injectable } from '@nestjs/common';
import type { Paging } from '../creators/paging.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { REVIEWABLE_STATUSES } from './draft-review.js';
import type {
  ReviewQueueItem,
  ReviewQueueResponse,
} from './dto/review-queue.dto.js';
import {
  compareQueueEntries,
  type QueueContentType,
  type QueueEntry,
  type QueueFilters,
  type QueueStatus,
} from './review-queue.js';

// Only what the table shows. Selecting columns (rather than whole rows) keeps briefs, contact
// details and OAuth tokens out of the response by construction.
const QUEUE_SELECT = {
  id: true,
  name: true,
  type: true,
  deadline: true,
  status: true,
  contracts: {
    select: {
      creators: {
        select: { first_name: true, middle_name: true, last_name: true },
      },
    },
  },
  submissions: {
    // Same order as approve picks "the latest hand-in", so the id a row carries is always one
    // approve accepts instead of answering SUBMISSION_SUPERSEDED.
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    take: 1,
    select: { id: true, created_at: true },
  },
} as const;

export interface QueueRow {
  id: string;
  name: string;
  type: QueueContentType;
  deadline: Date;
  /** Only queue statuses come back: the where clause asks for nothing else. */
  status: QueueStatus;
  contracts: {
    creators: {
      first_name: string;
      middle_name: string | null;
      last_name: string | null;
    };
  };
  submissions: { id: string; created_at: Date }[];
}

interface QueueWhere {
  status: { in: QueueStatus[] };
  submissions: { some: Record<string, never> };
  type?: QueueContentType;
  deadline?: { lt: Date };
}

/** The slice of Prisma this service touches, so tests can stub exactly that. */
export interface ReviewQueueClient {
  contents: {
    findMany: (args: {
      where: QueueWhere;
      select: typeof QUEUE_SELECT;
    }) => Promise<QueueRow[]>;
  };
}

/** What the controller needs from the service, so it can be swapped or stubbed by contract. */
export interface ReviewQueueLister {
  list(
    paging: Paging,
    today: Date,
    filters: QueueFilters,
  ): Promise<ReviewQueueResponse>;
}

/** Midnight UTC, matching how Postgres `date` columns arrive, so comparisons are day-wise. */
function startOfDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function creatorName(creator: QueueRow['contracts']['creators']): string {
  return [creator.first_name, creator.middle_name, creator.last_name]
    .filter(Boolean)
    .join(' ');
}

/** A response row plus the values it is ordered by. */
interface Queued {
  item: ReviewQueueItem;
  entry: QueueEntry;
}

@Injectable()
export class ReviewQueueService implements ReviewQueueLister {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: ReviewQueueClient,
  ) {}

  // The queue only ever holds drafts waiting for a decision, a small set compared to all
  // content, so it is filtered, sorted and paged in memory: the resubmits-first rank and the
  // name search then live in plain code that is tested directly.
  async list(
    paging: Paging,
    today: Date,
    filters: QueueFilters,
  ): Promise<ReviewQueueResponse> {
    const rows = await this.prisma.contents.findMany({
      where: this.where(today, filters),
      select: QUEUE_SELECT,
    });

    const queued = rows
      .flatMap((row) => this.toQueued(row))
      .filter((item) => this.matches(item, filters.q))
      .sort((a, b) => compareQueueEntries(a.entry, b.entry));

    const { page, pageSize } = paging;
    const start = (page - 1) * pageSize;

    return {
      items: queued.slice(start, start + pageSize).map(({ item }) => item),
      page,
      pageSize,
      total: queued.length,
      totalPages: Math.max(1, Math.ceil(queued.length / pageSize)),
    };
  }

  private where(today: Date, filters: QueueFilters): QueueWhere {
    const where: QueueWhere = {
      status: {
        in: filters.status ? [filters.status] : [...REVIEWABLE_STATUSES],
      },
      submissions: { some: {} },
    };
    if (filters.type) {
      where.type = filters.type;
    }
    if (filters.overdue) {
      where.deadline = { lt: startOfDay(today) };
    }
    return where;
  }

  /** A content without a hand-in cannot be reviewed; the where clause already excludes it. */
  private toQueued(row: QueueRow): Queued[] {
    const latest = row.submissions[0];
    if (!latest) {
      return [];
    }
    return [
      {
        item: {
          submissionId: latest.id,
          creatorName: creatorName(row.contracts.creators),
          contentName: row.name,
          type: row.type,
          deadline: row.deadline.toISOString().slice(0, 10),
          status: row.status,
        },
        entry: {
          submissionId: latest.id,
          status: row.status,
          deadline: row.deadline,
          submittedAt: latest.created_at,
        },
      },
    ];
  }

  private matches({ item }: Queued, q: string | undefined): boolean {
    if (!q) {
      return true;
    }
    const needle = q.toLowerCase();
    return (
      item.creatorName.toLowerCase().includes(needle) ||
      item.contentName.toLowerCase().includes(needle)
    );
  }
}
