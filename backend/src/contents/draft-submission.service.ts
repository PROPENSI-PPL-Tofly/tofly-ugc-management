import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { content_status } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { nextDraftStatus, type DraftSubmission } from './draft-submission.js';

export interface SubmittedDraft {
  contentId: string;
  submissionId: string;
  status: 'draft_review' | 'draft_revised';
  link: string;
  notes: string | null;
  /** ISO timestamp of the hand-in. */
  submittedAt: string;
}

/** The slice of Prisma a hand-in touches, so tests can stub exactly that. */
export interface DraftSubmissionTransaction {
  contents: {
    findFirst: (args: {
      where: {
        id: string;
        is_proposal: false;
        contracts: { creator_id: string };
      };
      select: { id: true; status: true };
    }) => Promise<{ id: string; status: content_status } | null>;
    updateMany: (args: {
      where: { id: string; status: content_status };
      data: { status: 'draft_review' | 'draft_revised' };
    }) => Promise<{ count: number }>;
  };
  submissions: {
    create: (args: {
      data: {
        content_id: string;
        creator_id: string;
        link: string;
        creator_notes: string | null;
      };
      select: { id: true; created_at: true };
    }) => Promise<{ id: string; created_at: Date }>;
  };
}

export interface DraftSubmissionClient {
  $transaction<T>(
    work: (transaction: DraftSubmissionTransaction) => Promise<T>,
  ): Promise<T>;
}

/** What the controller needs, so it can be stubbed by contract. */
export interface DraftSubmitter {
  submit(
    contentId: string,
    creatorId: string,
    input: DraftSubmission,
  ): Promise<SubmittedDraft>;
}

function notEligible(): ConflictException {
  return new ConflictException({
    code: 'DRAFT_NOT_ELIGIBLE',
    message: 'Konten ini sedang tidak menerima draft',
  });
}

@Injectable()
export class DraftSubmissionService implements DraftSubmitter {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: DraftSubmissionClient,
  ) {}

  /** Submit/Resubmit Draft (PRD 3.16): saves the link and moves the content on together. */
  async submit(
    contentId: string,
    creatorId: string,
    input: DraftSubmission,
  ): Promise<SubmittedDraft> {
    return this.prisma.$transaction(async (transaction) => {
      // Scoped to the caller's own committed contents: another creator's content and an
      // unapproved proposal read as missing, so a 404 never confirms they exist (OWASP A01).
      const content = await transaction.contents.findFirst({
        where: {
          id: contentId,
          is_proposal: false,
          contracts: { creator_id: creatorId },
        },
        select: { id: true, status: true },
      });
      if (!content) {
        throw new NotFoundException({
          code: 'CONTENT_NOT_FOUND',
          message: 'Konten tidak ditemukan',
        });
      }

      const status = nextDraftStatus(content.status);
      if (!status) {
        throw notEligible();
      }

      // Only moves the content if nothing changed it since it was read, so two tabs handing
      // in at once leave one submission, not two.
      const { count } = await transaction.contents.updateMany({
        where: { id: contentId, status: content.status },
        data: { status },
      });
      if (count === 0) {
        throw notEligible();
      }

      const submission = await transaction.submissions.create({
        data: {
          content_id: contentId,
          creator_id: creatorId,
          link: input.link,
          creator_notes: input.notes,
        },
        select: { id: true, created_at: true },
      });

      return {
        contentId,
        submissionId: submission.id,
        status,
        link: input.link,
        notes: input.notes,
        submittedAt: submission.created_at.toISOString(),
      };
    });
  }
}
