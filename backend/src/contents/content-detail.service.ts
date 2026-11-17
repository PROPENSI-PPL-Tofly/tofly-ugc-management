import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CONNECTION_SELECT,
  LINK_PERFORMANCE_SELECT,
} from '../performance/performance-links.js';
import { LINKS_AS_HANDED_IN } from './content-links.js';
import { DEFAULT_BUFFER_DAYS } from '../creators/new-creator.js';
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
  // The links in the order they were handed in: the first is the content's submitted one.
  content_links: {
    orderBy: LINKS_AS_HANDED_IN,
    select: { submitted_at: true, ...LINK_PERFORMANCE_SELECT },
  },
  video_submitted_at: true,
  approval_bypassed: true,
  created_at: true,
  updated_at: true,
  // The contract's dates and invoice decide whether and where an admin may move the deadline
  // (PBI-25 AC 1, 3, 9); a creator's read never sends them.
  contracts: {
    select: {
      start_date: true,
      end_date: true,
      invoice: { select: { status: true } },
      creators: {
        select: {
          first_name: true,
          middle_name: true,
          last_name: true,
          // Whether each account is connected decides a waiting link's state; no token.
          social_accounts: CONNECTION_SELECT,
        },
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
      revision_notes_html: true,
      // The note's screenshots (PBI-34 AC 8), first attached first.
      revision_note_images: {
        select: { id: true, content_type: true },
        orderBy: [{ created_at: 'asc' }],
      },
      creator_notes: true,
    },
  },
  // The stored history, newest first, with the email of the admin behind each admin event. Never
  // the account id itself: the panel has no use for it.
  content_events: {
    orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      event_type: true,
      actor_name: true,
      actor_role: true,
      occurred_at: true,
      event_data: true,
      users: { select: { email: true } },
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

    // Only an admin edits, so only an admin's read carries the edit window.
    return toContentDetail(
      row,
      now,
      options?.creatorId ? undefined : { bufferDays: DEFAULT_BUFFER_DAYS },
    );
  }
}
