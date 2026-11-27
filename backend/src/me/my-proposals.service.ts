import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { jakartaDay, joinName } from '../creators/evergreen.js';
import {
  CONTENT_SCHEDULING,
  type ContentScheduling,
} from '../deadline-buffer/deadline-scheduling.js';
import { DEFAULT_BUFFER_DAYS } from '../deadline-buffer/deadline-window.js';
import { lockContractRow } from '../invoices/contract-lock.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { proposalDeadlineError, type NewProposal } from './my-proposal.js';

// A creator's own Specific content ideas (PBI-14, 14.1): proposing one while the contract runs,
// and withdrawing it while nobody has decided on it. A proposal is a pending content: it holds no
// quota, owes no penalty and is not in the invoice (PBI-14 AC 6), because every one of those reads
// counts committed content only. The admin's decision, and the H-1 scheduling of an undecided one,
// already exist (proposal-review.service.ts).

type ProposalsTransaction = Pick<
  Prisma.TransactionClient,
  '$queryRaw' | 'contracts' | 'creators' | 'contents' | 'content_events'
>;

/** The slice of the database client proposals touch; tests hand in a stub of just that. */
export interface ProposalsClient {
  $transaction<T>(work: (tx: ProposalsTransaction) => Promise<T>): Promise<T>;
}

/** What "Ajukan Konten" answers with once the proposal is saved. */
export interface CreatedProposal {
  id: string;
  name: string;
  type: 'specific';
  brief: string;
  notes: string | null;
  /** YYYY-MM-DD */
  deadline: string;
  status: 'pending';
}

export interface WithdrawnProposal {
  id: string;
  removed: true;
}

/** What the controller needs from the service, so it can be swapped or stubbed by contract. */
export interface ProposalKeeper {
  create(creatorId: string, input: NewProposal): Promise<CreatedProposal>;
  cancel(creatorId: string, contentId: string): Promise<WithdrawnProposal>;
}

function toDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function noActiveContract(): ForbiddenException {
  return new ForbiddenException({
    code: 'NO_ACTIVE_CONTRACT',
    message: 'Pengajuan konten hanya bisa dilakukan selama kontrak aktif',
  });
}

function notFound(): NotFoundException {
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

@Injectable()
export class MyProposalsService implements ProposalKeeper {
  private readonly scheduling: ContentScheduling;

  constructor(
    @Inject(PrismaService) private readonly prisma: ProposalsClient,
    @Optional()
    @Inject(CONTENT_SCHEDULING)
    scheduling?: ContentScheduling,
  ) {
    this.scheduling = scheduling ?? {
      today: () => new Date(),
      bufferDays: async () => DEFAULT_BUFFER_DAYS,
    };
  }

  /**
   * Saves a pending Specific content on the contract that is running today, with the creator's
   * own first step in its history. The contract is locked before its dates are judged, the lock
   * an early end takes, so a deadline is never accepted against an end that was moved meanwhile.
   */
  async create(creatorId: string, input: NewProposal): Promise<CreatedProposal> {
    const now = this.scheduling.today();
    const bufferDays = await this.scheduling.bufferDays();

    return this.prisma.$transaction(async (tx) => {
      const today = new Date(`${jakartaDay(now)}T00:00:00.000Z`);
      const running = {
        where: {
          creator_id: creatorId,
          start_date: { lte: today },
          end_date: { gte: today },
        },
        select: { id: true, start_date: true, end_date: true },
        orderBy: { start_date: 'desc' },
      } as const;

      const candidate = await tx.contracts.findFirst(running);
      if (!candidate) {
        throw noActiveContract();
      }
      await lockContractRow(tx, candidate.id);
      const contract = await tx.contracts.findFirst(running);
      if (!contract) {
        throw noActiveContract();
      }

      const problem = proposalDeadlineError(
        { startDate: toDay(contract.start_date), endDate: toDay(contract.end_date) },
        input.deadline,
        jakartaDay(now),
        bufferDays,
      );
      if (problem) {
        throw new UnprocessableEntityException({
          message: 'Data pengajuan tidak valid',
          errors: { deadline: problem },
        });
      }

      const creator = await tx.creators.findUnique({
        where: { id: creatorId },
        select: { first_name: true, middle_name: true, last_name: true },
      });
      if (!creator) {
        throw new NotFoundException({
          code: 'CREATOR_NOT_FOUND',
          message: 'Kreator tidak ditemukan',
        });
      }

      const saved = await tx.contents.create({
        data: {
          contract_id: contract.id,
          type: 'specific',
          name: input.name,
          brief: input.brief,
          deadline: new Date(`${input.deadline}T00:00:00.000Z`),
          status: 'pending',
          proposal_notes: input.notes,
        },
      });

      await tx.content_events.create({
        data: {
          content_id: saved.id,
          event_type: 'Scheduled',
          actor_name: joinName(creator),
          actor_role: 'creator',
          occurred_at: now,
          event_data: {},
        },
      });

      return {
        id: saved.id,
        name: saved.name,
        type: 'specific',
        brief: saved.brief,
        notes: saved.proposal_notes,
        deadline: toDay(saved.deadline),
        status: 'pending',
      };
    });
  }

  /**
   * Withdraws the creator's own proposal. One statement carries the owner and the status, so of
   * a withdrawal and an approval racing, exactly one changes the row; the other is told where
   * the content stands. Another creator's content answers 404, like a missing one.
   */
  async cancel(creatorId: string, contentId: string): Promise<WithdrawnProposal> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.contents.deleteMany({
        where: { id: contentId, status: 'pending', contracts: { creator_id: creatorId } },
      });
      if (count === 1) {
        return { id: contentId, removed: true };
      }

      const content = await tx.contents.findFirst({
        where: { id: contentId, contracts: { creator_id: creatorId } },
        select: { status: true },
      });
      throw content ? notPending() : notFound();
    });
  }
}
