import {
  ADMIN_NOTIFIER,
  noAdminEmail,
  type AdminNotifier,
} from '../email/admin-notifier.js';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { content_status } from '@prisma/client';
import { jakartaDay } from '../creators/evergreen.js';
import { StartedPeriodSpecification } from '../creators/started-period.specification.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { COMMITTED_STATUSES } from './content-lifecycle.js';
import { nextDraftStatus, type DraftSubmission } from './draft-submission.js';
import { assertNotPastEarlyEnd, contentClosed } from './content-closed.js';
import { periodNotStarted } from './period-not-started.js';

export interface SubmittedDraft {
  contentId: string;
  submissionId: string;
  status: 'draft_review';
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
        status: { in: content_status[] };
        contracts: { creator_id: string };
      };
      select: {
        id: true;
        status: true;
        closed_at: true;
        contracts: { select: { start_date: true; end_date: true; original_end_date: true } };
      };
    }) => Promise<{
      id: string;
      status: content_status;
      closed_at: Date | null;
      contracts: { start_date: Date; end_date: Date; original_end_date: Date | null };
    } | null>;
    updateMany: (args: {
      where: { id: string; status: content_status };
      data: { status: 'draft_review' };
    }) => Promise<{ count: number }>;
  };
  submissions: {
    findMany: (args: {
      where: { content_id: string };
      select: { id: true };
    }) => Promise<{ id: string }[]>;
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
  creators: {
    findUnique: (args: {
      where: { id: string };
      select: { first_name: true; middle_name: true; last_name: true };
    }) => Promise<{
      first_name: string;
      middle_name: string | null;
      last_name: string | null;
    } | null>;
  };
  content_events: {
    create: (args: {
      data: {
        content_id: string;
        event_type: 'Draft Submitted';
        actor_name: string;
        actor_role: 'creator';
        occurred_at: Date;
        event_data: { version: number; link: string; note?: string };
      };
    }) => Promise<unknown>;
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
    @Optional()
    @Inject(ADMIN_NOTIFIER)
    private readonly admins: Pick<AdminNotifier, 'draftSubmitted'> = noAdminEmail,
  ) {}

  /**
   * Submit/Resubmit Draft (PRD 3.16): saves the link and moves the content on together.
   * `now` decides whether the content's period has started; it is the moment of the request
   * unless a test pins it.
   */
  async submit(
    contentId: string,
    creatorId: string,
    input: DraftSubmission,
    now: Date = new Date(),
  ): Promise<SubmittedDraft> {
    const submitted = await this.prisma.$transaction(async (transaction) => {
      // Scoped to the caller's own committed contents: another creator's content and an
      // unapproved proposal read as missing, so a 404 never confirms they exist (OWASP A01).
      const content = await transaction.contents.findFirst({
        where: {
          id: contentId,
          status: { in: [...COMMITTED_STATUSES] },
          contracts: { creator_id: creatorId },
        },
        select: {
          id: true,
          status: true,
          closed_at: true,
          contracts: { select: { start_date: true, end_date: true, original_end_date: true } },
        },
      });
      if (!content) {
        throw new NotFoundException({
          code: 'CONTENT_NOT_FOUND',
          message: 'Konten tidak ditemukan',
        });
      }
      // PBI-30.2 (AC 8.2.2): the creator's own content, but its period has not started yet.
      const started = new StartedPeriodSpecification(now);
      if (!started.isSatisfiedBy(content.contracts)) {
        throw periodNotStarted();
      }
      // PBI-37: due after the last day of a contract ended early.
      if (content.closed_at !== null) {
        throw contentClosed();
      }
      assertNotPastEarlyEnd(content.contracts, jakartaDay(now));

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

      const [previousSubmissions, creator] = await Promise.all([
        transaction.submissions.findMany({
          where: { content_id: contentId },
          select: { id: true },
        }),
        transaction.creators.findUnique({
          where: { id: creatorId },
          select: { first_name: true, middle_name: true, last_name: true },
        }),
      ]);

      if (!creator) {
        throw new NotFoundException({
          code: 'CREATOR_NOT_FOUND',
          message: 'Kreator tidak ditemukan',
        });
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

      await transaction.content_events.create({
        data: {
          content_id: contentId,
          event_type: 'Draft Submitted',
          actor_name: [
            creator.first_name,
            creator.middle_name,
            creator.last_name,
          ]
            .filter(Boolean)
            .join(' '),
          actor_role: 'creator',
          occurred_at: submission.created_at,
          event_data: {
            version: previousSubmissions.length + 1,
            link: input.link,
            // The creator's message to the admin travels with the draft it came with.
            ...(input.notes !== null && { note: input.notes }),
          },
        },
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
    // PBI-11 (AC 5, AC 9): every Admin hears once the draft is saved; never failing the hand-in.
    await this.admins.draftSubmitted({ contentId, submissionId: submitted.submissionId });
    return submitted;
  }
}
