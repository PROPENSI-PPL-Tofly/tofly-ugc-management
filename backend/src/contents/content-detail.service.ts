import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  toContentDetail,
  type ContentDetail,
  type ContentDetailRow,
} from './content-detail.js';

// One nested read per request: the content, its creator's name and every hand-in, so the
// panel's journey, waiting side and tags come from a single query (DoD-3's read budget).
// Selecting columns rather than whole rows keeps briefs, tokens and metrics out by
// construction, the way the queue and Task Saya reads do.
const CONTENT_DETAIL_SELECT = {
  id: true,
  name: true,
  type: true,
  brief: true,
  deadline: true,
  status: true,
  video_link: true,
  video_submitted_at: true,
  approval_bypassed: true,
  created_at: true,
  updated_at: true,
  contracts: {
    select: {
      creators: {
        select: { first_name: true, middle_name: true, last_name: true },
      },
    },
  },
  submissions: {
    // Oldest first, so versions count up along the way; the pure assembler re-sorts for
    // the panel and still picks the latest hand-in for the approve/revise endpoints.
    orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      link: true,
      created_at: true,
      updated_at: true,
      revision_notes: true,
      creator_notes: true,
    },
  },
} as const;

/** The slice of Prisma this service touches, so tests can stub exactly that. */
export interface ContentDetailClient {
  contents: {
    findFirst: (args: {
      where: { id: string; contracts?: { creator_id: string } };
      select: typeof CONTENT_DETAIL_SELECT;
    }) => Promise<ContentDetailRow | null>;
  };
}

/** What the controllers need, so they can be stubbed by contract. */
export interface ContentDetailReader {
  getDetail(
    id: string,
    now: Date,
    options?: { creatorId?: string },
  ): Promise<ContentDetail>;
}

@Injectable()
export class ContentDetailService implements ContentDetailReader {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: ContentDetailClient,
  ) {}

  /**
   * One content item's panel payload. A creator's read is scoped by the contract they own
   * rather than by the id alone, and answers 404 (not 403) for anyone else's content, so the
   * endpoint never confirms that an id exists (OWASP A01).
   */
  async getDetail(
    id: string,
    now: Date,
    options?: { creatorId?: string },
  ): Promise<ContentDetail> {
    const row = await this.prisma.contents.findFirst({
      where: {
        id,
        ...(options?.creatorId && {
          contracts: { creator_id: options.creatorId },
        }),
      },
      select: CONTENT_DETAIL_SELECT,
    });

    if (!row) {
      throw new NotFoundException({
        code: 'CONTENT_NOT_FOUND',
        message: 'Konten tidak ditemukan',
      });
    }

    return toContentDetail(row, now);
  }
}
