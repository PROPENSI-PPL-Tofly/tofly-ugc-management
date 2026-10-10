import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { schedulingCutoff, type RejectReason } from './proposal-review.js';

// An admin's decision on a creator's proposal (PRD 3.10), and the H-1 arrow that schedules a
// proposal nobody decided on. Every write names the status it expects in its own WHERE, so of
// two decisions racing on one proposal (a double click, two admins, an approval against the
// H-1 promotion) exactly one changes the row and the other is answered 409.

interface ProposalRow {
  status: string;
  name: string;
  contracts: { creator_id: string };
}

/** The slice of Prisma this service touches, so tests can stub exactly that. */
export interface ProposalReviewClient {
  contents: {
    findUnique: (args: {
      where: { id: string };
      select: { status: true; name: true; contracts: { select: { creator_id: true } } };
    }) => Promise<ProposalRow | null>;
    updateMany: (args: {
      where:
        | { id: string; status: 'pending' }
        | { status: 'pending'; deadline: { lte: Date } };
      data: { status: 'scheduled' };
    }) => Promise<{ count: number }>;
    deleteMany: (args: { where: { id: string; status: 'pending' } }) => Promise<{
      count: number;
    }>;
  };
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
  contracts: { select: { creator_id: true } },
} as const;

@Injectable()
export class ProposalReviewService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: ProposalReviewClient,
    @Optional()
    @Inject(PROPOSAL_NOTIFIER)
    private readonly notifier: ProposalNotifier = mockEmail,
  ) {}

  /** The proposal becomes a normal, schedule-visible content item (Scheduled). */
  async approve(id: string): Promise<ApprovedProposal> {
    const { count } = await this.prisma.contents.updateMany({
      where: { id, status: 'pending' },
      data: { status: 'scheduled' },
    });
    if (count === 0) {
      // Nothing matched: either there is no such content or it is no longer a proposal.
      const row = await this.prisma.contents.findUnique({ where: { id }, select: PROPOSAL_SELECT });
      throw row ? notPending() : contentNotFound();
    }
    return { id, status: 'scheduled' };
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
   * creator can still hand it in. One statement for all of them; answers how many moved.
   */
  async scheduleDue(now: Date): Promise<number> {
    const { count } = await this.prisma.contents.updateMany({
      where: { status: 'pending', deadline: { lte: schedulingCutoff(now) } },
      data: { status: 'scheduled' },
    });
    return count;
  }
}
