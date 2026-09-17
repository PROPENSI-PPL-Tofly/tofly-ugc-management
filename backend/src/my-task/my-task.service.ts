import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { MyTask, MyTaskListResponse } from './dto/my-task.dto.js';
import type { SubmitDraftDto } from './dto/submit-draft.dto.js';
import {
  DEFAULT_TASK_PAGE_SIZE,
  type ListMyContentsQuery,
  MAX_TASK_PAGE_SIZE,
} from './dto/list-my-contents.query.js';
import {
  canSubmitDraft,
  canSubmitVideo,
  type ContentStatus,
  DRAFT_ELIGIBLE_STATUSES,
  daysUntil,
  isInGracePeriod,
} from './task-rules.js';

export const TASK_SELECT = {
  id: true,
  name: true,
  type: true,
  brief: true,
  deadline: true,
  status: true,
  videoLink: true,
  platform: true,
  submissions: {
    orderBy: { createdAt: 'asc' },
    select: {
      link: true,
      creatorNotes: true,
      revisionNotes: true,
      createdAt: true,
    },
  },
} as const;

export type TaskRow = {
  id: string;
  name: string;
  type: 'evergreen' | 'specific';
  brief: string;
  deadline: Date;
  status: ContentStatus;
  videoLink: string | null;
  platform: 'instagram' | 'tiktok' | null;
  submissions: {
    link: string;
    creatorNotes: string | null;
    revisionNotes: string | null;
    createdAt: Date;
  }[];
};

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Content this creator owes: everything under their contracts except proposals an admin has
 * not accepted yet. The PRD keeps a pending proposal off every schedule view, and it is not
 * a commitment until accepted.
 */
export function ownedContent(creatorId: string) {
  return { isProposal: false, contract: { creatorId } };
}

export function toMyTask(row: TaskRow, today: Date): MyTask {
  const latest = row.submissions.at(-1);

  return {
    id: row.id,
    name: row.name,
    type: row.type,
    brief: row.brief,
    deadline: isoDate(row.deadline),
    status: row.status,
    daysUntilDeadline: daysUntil(row.deadline, today),
    videoLink: row.videoLink,
    platform: row.platform,
    latestDraft: latest
      ? {
          link: latest.link,
          creatorNotes: latest.creatorNotes,
          submittedAt: isoDate(latest.createdAt),
          revisionNotes: latest.revisionNotes,
          revisionCount: row.submissions.length - 1,
        }
      : null,
    actions: {
      canSubmitDraft: canSubmitDraft(row.status),
      isResubmission: row.status === 'draft_revision',
      canSubmitVideo: canSubmitVideo(row.status, row.deadline, today),
      inGracePeriod:
        row.status !== 'link_submitted' && isInGracePeriod(row.deadline, today),
    },
  };
}

// The coverage hint covers a branch the compiler emits for decorator metadata.
/* v8 ignore start */
@Injectable()
/* v8 ignore stop */
export class MyTaskService {
  private readonly logger = new Logger(MyTaskService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Nearest deadline first; ties broken by name, then id, so paging never reshuffles rows. */
  async list(
    creatorId: string,
    query: ListMyContentsQuery,
  ): Promise<MyTaskListResponse> {
    const today = this.clock.now();
    const pageSize = Math.min(
      query.pageSize ?? DEFAULT_TASK_PAGE_SIZE,
      MAX_TASK_PAGE_SIZE,
    );
    const page = query.page ?? 1;
    const where = ownedContent(creatorId);

    const [total, rows] = await Promise.all([
      this.prisma.content.count({ where }),
      this.prisma.content.findMany({
        where,
        orderBy: [{ deadline: 'asc' }, { name: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: TASK_SELECT,
      }),
    ]);

    return {
      items: (rows as unknown as TaskRow[]).map((row) => toMyTask(row, today)),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /**
   * Hands in a draft (first time or after "Minta Revisi") and puts the content back in the
   * review queue.
   *
   * Eligibility is re-checked here rather than trusted from the button: the content must be
   * Scheduled or waiting for revision. The status change is a conditional update on the
   * status it was read with, so two submits racing each other cannot both succeed — the
   * loser gets the same 409 as any other ineligible submit.
   */
  async submitDraft(
    creatorId: string,
    contentId: string,
    dto: SubmitDraftDto,
  ): Promise<MyTask> {
    const today = this.clock.now();

    const task = await this.prisma.$transaction(async (tx) => {
      const content = await tx.content.findFirst({
        where: { id: contentId, ...ownedContent(creatorId) },
        select: { status: true },
      });
      // Someone else's content is reported exactly like content that does not exist.
      if (!content) throw contentNotFound();
      if (!canSubmitDraft(content.status))
        throw draftNotAllowed(content.status);

      const claimed = await tx.content.updateMany({
        where: { id: contentId, status: { in: [...DRAFT_ELIGIBLE_STATUSES] } },
        data: { status: 'draft_review' },
      });
      if (claimed.count === 0) throw draftNotAllowed(content.status);

      await tx.submission.create({
        data: {
          contentId,
          creatorId,
          link: dto.link,
          creatorNotes: dto.creatorNotes || null,
        },
      });

      return tx.content.findUniqueOrThrow({
        where: { id: contentId },
        select: TASK_SELECT,
      });
    });

    this.logger.log(`Draft submitted for content ${contentId}`);
    return toMyTask(task as unknown as TaskRow, today);
  }
}

function contentNotFound(): NotFoundException {
  return new NotFoundException({
    code: 'CONTENT_NOT_FOUND',
    message: 'Konten tidak ditemukan',
  });
}

function draftNotAllowed(status: ContentStatus): ConflictException {
  return new ConflictException({
    code: 'DRAFT_NOT_ALLOWED',
    message:
      'Draft hanya bisa dikirim saat konten berstatus Scheduled atau perlu revisi',
    status,
  });
}
