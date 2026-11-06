import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { latestDeadline, pastLatestDeadline } from '../creators/evergreen.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  adminActor,
  SYSTEM_ACTOR_NAME,
  type AdminActor,
} from './content-event-actors.js';
import { schedulingCutoff, type RejectReason } from './proposal-review.js';

// An admin's decision on a creator's proposal (PRD 3.10), and the H-1 arrow that schedules a
// proposal nobody decided on. Every write names the status it expects in its own WHERE, so of
// two decisions racing on one proposal (a double click, two admins, an approval against the
// H-1 promotion) exactly one changes the row and the other is answered 409.

interface ProposalRow {
  status: string;
  name: string;
  deadline: Date;
  contracts: { creator_id: string; end_date: Date };
}

/** The slice of Prisma this service touches, so tests can stub exactly that. */
export interface ProposalReviewClient {
  contents: {
    findUnique: (args: {
      where: { id: string };
      select: typeof PROPOSAL_SELECT;
    }) => Promise<ProposalRow | null>;
    updateMany: (args: {
      where: { id: string; status: 'pending' };
      data: { status: 'scheduled' };
    }) => Promise<{ count: number }>;
    updateManyAndReturn: (args: {
      where: { status: 'pending'; deadline: { lte: Date } };
      data: { status: 'scheduled' };
      select: { id: true };
    }) => Promise<{ id: string }[]>;
    deleteMany: (args: { where: { id: string; status: 'pending' } }) => Promise<{
      count: number;
    }>;
  };
  content_events: {
    create: (args: {
      data: AdminActor & {
        content_id: string;
        event_type: 'Proposal Approved';
        occurred_at: Date;
        event_data: Record<string, never>;
      };
    }) => Promise<unknown>;
    createMany: (args: {
      data: {
        content_id: string;
        event_type: 'Auto Scheduled';
        actor_name: typeof SYSTEM_ACTOR_NAME;
        actor_role: 'system';
        actor_user_id: null;
        occurred_at: Date;
        event_data: Record<string, never>;
      }[];
    }) => Promise<{ count: number }>;
  };
  $transaction<T>(work: (transaction: ProposalReviewClient) => Promise<T>): Promise<T>;
}

/** Who hears that a proposal was turned down; the PRD sends it by email. */
export interface ProposalNotifier {
  proposalRejected(input: {
    creatorId: string;
    contentName: string;
    reason: string | null;
  }): void;
}

export const PROPOSAL_NOTIFIER = Symbol('PROPOSAL_NOTIFIER');

/** Stands in for the email until notifications are built, like Add Content's mock email. */
const mockEmail: ProposalNotifier = {
  proposalRejected(input) {
    console.info('[MOCK EMAIL] Creator proposal rejected', input);
  },
};

export interface ApprovedProposal {
  id: string;
  status: 'scheduled';
}

export interface RejectedProposal {
  id: string;
  removed: true;
}

function contentNotFound(): NotFoundException {
  return new NotFoundException({
    code: 'CONTENT_NOT_FOUND',
    message: 'Konten tidak ditemukan',
  });
}

function notPending(): ConflictException {
  return new ConflictException({
    code: 'PROPOSAL_NOT_PENDING',
    message: 'Pengajuan ini sudah tidak menunggu keputusan',
  });
}

const PROPOSAL_SELECT = {
  status: true,
  name: true,
  deadline: true,
  contracts: { select: { creator_id: true, end_date: true } },
} as const;

/** The refusal of a proposal past the H-5 line (PBI-38 AC 15), or nothing when it fits. */
function pastLatest(row: ProposalRow): UnprocessableEntityException | null {
  const end = row.contracts.end_date.toISOString().slice(0, 10);
  if (row.deadline.toISOString().slice(0, 10) <= latestDeadline(end)) {
    return null;
  }
  return new UnprocessableEntityException({
    code: 'PROPOSAL_PAST_LATEST_DEADLINE',
    message: pastLatestDeadline(end),
  });
}

@Injectable()
export class ProposalReviewService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: ProposalReviewClient,
    @Optional()
    @Inject(PROPOSAL_NOTIFIER)
    private readonly notifier: ProposalNotifier = mockEmail,
  ) {}

  /**
   * The proposal becomes a normal, schedule-visible content item (Scheduled), and its history
   * records who approved it, in the same transaction so neither stands without the other.
   */
  async approve(id: string, adminUserId?: string): Promise<ApprovedProposal> {
    return this.prisma.$transaction(async (transaction) => {
      const row = await transaction.contents.findUnique({
        where: { id },
        select: PROPOSAL_SELECT,
      });
      if (!row) {
        throw contentNotFound();
      }
      const refusal = pastLatest(row);
      if (row.status === 'pending' && refusal) {
        throw refusal;
      }

      const { count } = await transaction.contents.updateMany({
        where: { id, status: 'pending' },
        data: { status: 'scheduled' },
      });
      if (count === 0) {
        // Nothing matched: it is no longer a proposal.
        throw notPending();
      }

      await transaction.content_events.create({
        data: {
          content_id: id,
          event_type: 'Proposal Approved',
          ...adminActor(adminUserId ?? null),
          occurred_at: new Date(),
          event_data: {},
        },
      });
      return { id, status: 'scheduled' };
    });
  }

  /** A rejected proposal is discarded entirely (PRD 3.10); its creator is told why, if given. */
  async reject(id: string, { reason }: RejectReason): Promise<RejectedProposal> {
    // Read first: the creator and the name are needed for the message, and are gone after.
    const row = await this.prisma.contents.findUnique({ where: { id }, select: PROPOSAL_SELECT });
    if (!row) {
      throw contentNotFound();
    }
    if (row.status !== 'pending') {
      throw notPending();
    }

    const { count } = await this.prisma.contents.deleteMany({ where: { id, status: 'pending' } });
    if (count === 0) {
      throw notPending();
    }

    this.notifier.proposalRejected({
      creatorId: row.contracts.creator_id,
      contentName: row.name,
      reason,
    });
    return { id, removed: true };
  }

  /**
   * Schedules every proposal still pending from H-1 of its deadline on, approved or not, so the
   * creator can still hand it in, and records in each one's history that the system did it.
   * One statement for the move and one for the history, in one transaction; answers how many
   * moved. On most requests nothing is due and nothing is written.
   */
  async scheduleDue(now: Date): Promise<number> {
    return this.prisma.$transaction(async (transaction) => {
      // The status guard is in the UPDATE itself, so two requests promoting at once move (and
      // record) each proposal once: the second finds it no longer pending.
      const promoted = await transaction.contents.updateManyAndReturn({
        where: { status: 'pending', deadline: { lte: schedulingCutoff(now) } },
        data: { status: 'scheduled' },
        select: { id: true },
      });
      if (promoted.length > 0) {
        await transaction.content_events.createMany({
          data: promoted.map(({ id }) => ({
            content_id: id,
            event_type: 'Auto Scheduled',
            actor_name: SYSTEM_ACTOR_NAME,
            actor_role: 'system',
            actor_user_id: null,
            occurred_at: now,
            event_data: {},
          })),
        });
      }
      return promoted.length;
    });
  }
}
