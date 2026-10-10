import { Inject, Injectable } from '@nestjs/common';
import type { Paging } from '../creators/paging.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ContentStatus } from './content-lifecycle.js';
import type { ContentListFilters, ContentListType } from './content-list.js';
import type { ContentListResponse } from './dto/content-list.dto.js';

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
    findMany: (args: { select: object }) => Promise<ContentListRow[]>;
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

@Injectable()
export class ContentListService implements ContentListLister {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: ContentListClient,
  ) {}

  // Not written yet; the spec beside this file says what it has to do.
  list(paging: Paging): Promise<ContentListResponse> {
    return Promise.resolve({
      items: [],
      page: paging.page,
      pageSize: paging.pageSize,
      total: 0,
      totalPages: 1,
      tabCounts: { all: 0, needs_approval: 0, waiting_creator: 0, done: 0 },
    });
  }
}
