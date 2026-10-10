import { Inject, Injectable } from '@nestjs/common';
import { adminActor, type AdminActor } from '../contents/content-event-actors.js';
import { unauthenticated } from '../auth/creator-request.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { checkReviewable, REVIEWABLE_STATUSES } from './draft-review.js';
import type { ApprovedSubmission } from './dto/approved-submission.dto.js';
import { reviewConflict, submissionNotFound } from './review-errors.js';

type ReviewableStatus = (typeof REVIEWABLE_STATUSES)[number];

interface SubmissionUnderReview {
  id: string;
  content_id: string;
  contents: {
    status: string;
    /** Newest hand-in only (take: 1). */
    submissions: { id: string }[];
  };
}

/** The slice of Prisma this service touches, so tests can stub exactly that. */
export interface SubmissionReviewClient {
  submissions: {
    findUnique: (args: {
      where: { id: string };
      select: {
        id: true;
        content_id: true;
        contents: {
          select: {
            status: true;
            submissions: {
              orderBy: [{ created_at: 'desc' }, { id: 'desc' }];
              take: 1;
              select: { id: true };
            };
          };
        };
      };
    }) => Promise<SubmissionUnderReview | null>;
  };

  contents: {
    updateMany: (args: {
      where: { id: string; status: { in: ReviewableStatus[] } };
      data: { status: 'draft_approved' };
    }) => Promise<{ count: number }>;
  };

  $transaction?<T>(
    work: (transaction: SubmissionReviewTransaction) => Promise<T>,
  ): Promise<T>;
}

interface SubmissionReviewTransaction {
  contents: SubmissionReviewClient['contents'];
  users: {
    findUnique: (args: {
      where: { id: string };
      select: { id: true };
    }) => Promise<{ id: string } | null>;
  };
  content_events: {
    create: (args: {
      data: AdminActor & {
        content_id: string;
        event_type: 'Draft Approved';
        occurred_at: Date;
        event_data: Record<string, never>;
      };
    }) => Promise<unknown>;
  };
}

@Injectable()
export class SubmissionReviewService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: SubmissionReviewClient,
  ) {}

  async approve(id: string, adminUserId?: string): Promise<ApprovedSubmission> {
    const submission = await this.prisma.submissions.findUnique({
      where: { id },
      select: {
        id: true,
        content_id: true,
        contents: {
          select: {
            status: true,
            submissions: {
              orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
              take: 1,
              select: { id: true },
            },
          },
        },
      },
    });

    if (!submission) {
      throw submissionNotFound();
    }

    const rejected = checkReviewable({
      contentStatus: submission.contents.status,
      isLatest: submission.contents.submissions[0]?.id === submission.id,
    });
    if (rejected) {
      throw reviewConflict(rejected);
    }

    // Compare-and-set: the status guard lives in the UPDATE itself, so of two decisions racing
    // on the same draft (double click, replayed request, approve vs. revise) exactly one
    // matches the row and the other gets count 0 instead of overwriting it.
    const recordInTransaction = async (
      transaction: SubmissionReviewTransaction,
    ): Promise<void> => {
      const { count } = await transaction.contents.updateMany({
        where: {
          id: submission.content_id,
          status: { in: [...REVIEWABLE_STATUSES] },
        },
        data: { status: 'draft_approved' },
      });
      if (count === 0) {
        throw reviewConflict('DRAFT_NOT_REVIEWABLE');
      }

      // Direct service callers without an authenticated request retain the existing contract;
      // the guarded HTTP route always supplies the Admin ID and records the audit event.
      if (adminUserId === undefined) return;

      const admin = await transaction.users.findUnique({
        where: { id: adminUserId },
        select: { id: true },
      });
      if (!admin) throw unauthenticated();

      await transaction.content_events.create({
        data: {
          content_id: submission.content_id,
          event_type: 'Draft Approved',
          ...adminActor(admin.id),
          occurred_at: new Date(),
          event_data: {},
        },
      });
    };

    if (this.prisma.$transaction) {
      await this.prisma.$transaction(recordInTransaction);
    } else if (adminUserId === undefined) {
      // Keep the actorless service contract usable for existing internal callers.
      const { count } = await this.prisma.contents.updateMany({
        where: {
          id: submission.content_id,
          status: { in: [...REVIEWABLE_STATUSES] },
        },
        data: { status: 'draft_approved' },
      });
      if (count === 0) throw reviewConflict('DRAFT_NOT_REVIEWABLE');
    } else {
      throw new Error('Approval event recording requires a transaction client');
    }

    return {
      id: submission.id,
      contentId: submission.content_id,
      status: 'draft_approved',
    };
  }
}
