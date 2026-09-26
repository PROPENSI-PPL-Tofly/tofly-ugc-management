import { Inject, Injectable } from '@nestjs/common';
import type { content_status, content_type } from '@prisma/client';
import { jakartaDay } from '../creators/evergreen.js';
import type { Paging } from '../creators/paging.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  MyContentItem,
  MyContentsResponse,
} from './dto/my-contents.dto.js';
import { compareMyTasks } from './my-tasks.js';
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
    }) => Promise<MyContentRow[]>;
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

  // One creator holds a few dozen contents across their contracts, so the open-first order
  // and the paging run in memory, in plain code that is tested directly.
  async list(
    creatorId: string,
    paging: Paging,
    now: Date,
  ): Promise<MyContentsResponse> {
    const rows = await this.prisma.contents.findMany({
      where: { is_proposal: false, contracts: { creator_id: creatorId } },
      select: MY_CONTENT_SELECT,
    });

    const today = jakartaDay(now);
    const items = rows
      .map((row) => this.toItem(row, today))
      .sort(compareMyTasks);

    const { page, pageSize } = paging;
    const start = (page - 1) * pageSize;

    return {
      items: items.slice(start, start + pageSize),
      page,
      pageSize,
      total: items.length,
      totalPages: Math.max(1, Math.ceil(items.length / pageSize)),
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
