import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  checkReviewable,
  REVIEWABLE_STATUSES,
  type ReviewRejection,
} from './draft-review.js';
import type { ApprovedSubmission } from './dto/approved-submission.dto.js';

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
}

const REJECTION_MESSAGES: Record<ReviewRejection, string> = {
  DRAFT_NOT_REVIEWABLE: 'Draft ini sudah tidak menunggu keputusan',
  SUBMISSION_SUPERSEDED: 'Creator sudah mengirim draft yang lebih baru',
};

function conflict(code: ReviewRejection): ConflictException {
  return new ConflictException({ code, message: REJECTION_MESSAGES[code] });
}

@Injectable()
export class SubmissionReviewService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: SubmissionReviewClient,
  ) {}

  async approve(id: string): Promise<ApprovedSubmission> {
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
      throw new NotFoundException({
        code: 'SUBMISSION_NOT_FOUND',
        message: 'Draft tidak ditemukan',
      });
    }

    const rejected = checkReviewable({
      contentStatus: submission.contents.status,
      isLatest: submission.contents.submissions[0]?.id === submission.id,
    });
    if (rejected) {
      throw conflict(rejected);
    }

    // Compare-and-set: the status guard lives in the UPDATE itself, so of two decisions racing
    // on the same draft (double click, replayed request, approve vs. revise) exactly one
    // matches the row and the other gets count 0 instead of overwriting it.
    const { count } = await this.prisma.contents.updateMany({
      where: {
        id: submission.content_id,
        status: { in: [...REVIEWABLE_STATUSES] },
      },
      data: { status: 'draft_approved' },
    });
    if (count === 0) {
      throw conflict('DRAFT_NOT_REVIEWABLE');
    }

    return {
      id: submission.id,
      contentId: submission.content_id,
      status: 'draft_approved',
    };
  }
}
