import { Inject, Injectable } from '@nestjs/common';
import type { content_status, content_type } from '@prisma/client';
import { jakartaDay } from '../creators/evergreen.js';
import type { Paging } from '../creators/paging.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  MyContentItem,
  MyContentsResponse,
} from './dto/my-contents.dto.js';
import { taskActions } from './task-actions.js';

// Only what a row and its modals show. Selecting columns (rather than whole rows) keeps
// performance numbers, video links and anything added later out of the response by construction.
const MY_CONTENT_SELECT = {
  id: true,
  name: true,
  type: true,
  brief: true,
  deadline: true,
  status: true,
} as const;

// Nearest deadline first, then name and id so rows sharing a deadline keep their place from
// one page to the next.
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
}

interface MyContentsWhere {
  // A pending proposal is not assigned work yet; it belongs to the proposal flow.
  is_proposal: false;
  contracts: { creator_id: string };
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
    paging: Paging,
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
  // many contents the creator holds.
  async list(
    creatorId: string,
    paging: Paging,
    now: Date,
  ): Promise<MyContentsResponse> {
    const where: MyContentsWhere = {
      is_proposal: false,
      contracts: { creator_id: creatorId },
    };
    const { page, pageSize } = paging;

    const [rows, total] = await Promise.all([
      this.prisma.contents.findMany({
        where,
        select: MY_CONTENT_SELECT,
        orderBy: MY_CONTENT_ORDER,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.contents.count({ where }),
    ]);

    const today = jakartaDay(now);

    return {
      items: rows.map((row) => this.toItem(row, today)),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
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
    };
  }
}
