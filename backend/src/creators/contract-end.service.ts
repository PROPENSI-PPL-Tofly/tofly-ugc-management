import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import {
  CREATOR_NOTIFIER,
  noCreatorEmail,
  type CreatorNotifier,
} from '../email/creator-notifier.js';
import { Prisma } from '@prisma/client';
import { lockContractRow } from '../invoices/contract-lock.js';
import { invoiceState } from '../invoices/invoice-lifecycle.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CONTRACT_END_AUDIT,
  type ContractEndAudit,
} from './contract-end-audit.js';
import {
  assertCanEndEarly,
  checkEarlyEnd,
  END_REASON_LABELS,
  planEarlyEnd,
  type EarlyEndPlan,
  type EarlyEndRequest,
} from './early-end.js';
import { periodHasStarted } from './contract-period.js';
import { joinName } from './evergreen.js';

/** The creator and every period they have, with what an early end decides on. */
const CREATOR_PERIODS = {
  first_name: true,
  middle_name: true,
  last_name: true,
  contracts: {
    select: {
      id: true,
      start_date: true,
      end_date: true,
      original_end_date: true,
      invoice: { select: { status: true } },
    },
  },
} satisfies Prisma.creatorsSelect;

type CreatorPeriods = Prisma.creatorsGetPayload<{ select: typeof CREATOR_PERIODS }>;
type PeriodRow = CreatorPeriods['contracts'][number];

const PLAN_CONTENT = {
  id: true,
  name: true,
  deadline: true,
  status: true,
} satisfies Prisma.contentsSelect;

/** The reads an early end and its preview share. */
type ContractEndReader = Pick<Prisma.TransactionClient, 'creators' | 'contents'>;

type ContractEndTransaction = ContractEndReader &
  Pick<Prisma.TransactionClient, '$queryRaw' | 'contracts' | 'invoices'>;

/** The slice of the database client an early end touches; tests hand in a stub of just that. */
export interface ContractEndClient extends ContractEndReader {
  $transaction<T>(work: (tx: ContractEndTransaction) => Promise<T>): Promise<T>;
}

/** What the end saved: the plan the confirmation showed, and where the invoice now stands. */
export interface EndedContract extends EarlyEndPlan {
  contractId: string;
  invoiceStatus: 'running' | 'cancelled';
}

/** What the early-end endpoints need, so the controller can inject or stub them by contract. */
export interface ContractEnder {
  preview(
    creatorId: string,
    contractId: string,
    body: unknown,
    now: Date,
  ): Promise<EarlyEndPlan>;
  end(
    creatorId: string,
    contractId: string,
    body: unknown,
    now: Date,
    adminUserId?: string,
  ): Promise<EndedContract>;
}

interface Judged {
  creator: CreatorPeriods;
  period: PeriodRow;
  request: EarlyEndRequest;
  plan: EarlyEndPlan;
}

function day(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function auditNote({ reason, note }: EarlyEndRequest): string {
  return `${END_REASON_LABELS[reason]} · ${note}`;
}

/**
 * "Akhiri Kontrak Lebih Awal" (PBI-37). The preview answers the confirmation screen; the end writes
 * the same plan in one transaction that locks the creator (periods are deleted) and then the
 * contract with the lock Finalize takes, so a second admin reads the first one's end and is told
 * "Kontrak sudah diakhiri". The rules themselves are pure, in early-end.ts.
 */
@Injectable()
export class ContractEndService implements ContractEnder {
  constructor(
    @Inject(PrismaService) private readonly prisma: ContractEndClient,
    @Inject(CONTRACT_END_AUDIT) private readonly audit: ContractEndAudit,
    @Optional()
    @Inject(CREATOR_NOTIFIER)
    private readonly notifier: Pick<CreatorNotifier, 'contractEndedEarly'> = noCreatorEmail,
  ) {}

  async preview(
    creatorId: string,
    contractId: string,
    body: unknown,
    now: Date,
  ): Promise<EarlyEndPlan> {
    const { plan } = await this.judge(this.prisma, creatorId, contractId, body, now);
    return plan;
  }

  async end(
    creatorId: string,
    contractId: string,
    body: unknown,
    now: Date,
    adminUserId?: string,
  ): Promise<EndedContract> {
    const ended = await this.prisma.$transaction(async (tx): Promise<EndedContract> => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM creators WHERE id = ${creatorId}::uuid FOR UPDATE`,
      );
      await lockContractRow(tx, contractId);
      const { creator, period, request, plan } = await this.judge(
        tx,
        creatorId,
        contractId,
        body,
        now,
      );
      const by = adminUserId ?? null;

      await tx.contracts.update({
        where: { id: contractId },
        data: {
          end_date: day(plan.lastDay),
          original_end_date: period.end_date,
          end_reason: request.reason,
          end_note: request.note,
          ended_at: now,
          ended_by: by,
          updated_at: now,
        },
      });
      if (plan.closing.length > 0) {
        await tx.contents.updateMany({
          // A link handed in since the read keeps its content open.
          where: {
            id: { in: plan.closing.map((content) => content.id) },
            status: { not: 'link_submitted' },
          },
          data: { closed_at: now, updated_at: now },
        });
      }
      if (plan.deletedPeriods.length > 0) {
        // Their contents, history and empty invoices cascade with them.
        await tx.contracts.deleteMany({
          where: {
            id: { in: plan.deletedPeriods.map((deleted) => deleted.contractId) },
            creator_id: creatorId,
          },
        });
      }

      const name = joinName(creator);
      await this.audit.recordBy(tx, adminUserId, {
        action: 'contract_ended_early',
        target: { id: contractId, label: name },
        creatorId,
        oldValues: { endDate: plan.originalEndDate },
        newValues: {
          endDate: plan.lastDay,
          invoice: request.invoice,
          reason: request.reason,
          closedContents: plan.closing.length,
          upcomingPeriods: plan.upcomingPeriods,
          deletedPeriods: plan.deletedPeriods.map((deleted) => deleted.periodNumber),
          keptPeriods: plan.keptPeriods.map((kept) => kept.periodNumber),
        },
        note: auditNote(request),
      });

      if (request.invoice === 'cancel') {
        const cancelled = { status: 'cancelled', cancelled_at: now, cancelled_by: by } as const;
        const invoice = await tx.invoices.upsert({
          where: { contract_id: contractId },
          create: { contract_id: contractId, ...cancelled },
          update: cancelled,
          select: { id: true },
        });
        await this.audit.recordBy(tx, adminUserId, {
          action: 'invoice_cancelled',
          target: { id: invoice.id, label: `${name} · Periode ${this.periodNumber(creator, period)}` },
          creatorId,
          oldValues: { status: 'running' },
          newValues: { status: 'cancelled' },
          note: auditNote(request),
        });
      }

      return {
        contractId,
        invoiceStatus: request.invoice === 'cancel' ? 'cancelled' : 'running',
        ...plan,
      };
    });
    // PBI-11 (AC 4, AC 9): once saved; the last day and the invoice choice, never the reason.
    await this.notifier.contractEndedEarly({
      creatorId,
      contractId,
      lastDay: ended.lastDay,
      invoice: ended.invoiceStatus === 'cancelled' ? 'cancelled' : 'paid',
    });
    return ended;
  }

  /** Reads the creator's periods and the contract's content, then applies every rule to them. */
  private async judge(
    client: ContractEndReader,
    creatorId: string,
    contractId: string,
    body: unknown,
    now: Date,
  ): Promise<Judged> {
    const creator = await client.creators.findUnique({
      where: { id: creatorId },
      select: CREATOR_PERIODS,
    });
    if (!creator) {
      throw new NotFoundException({
        code: 'CREATOR_NOT_FOUND',
        message: 'Creator tidak ditemukan',
      });
    }
    // Another creator's contract is a 404 like a missing one, so an id never says whose it is.
    const period = creator.contracts.find((contract) => contract.id === contractId);
    if (!period) {
      throw new NotFoundException({
        code: 'PERIOD_NOT_FOUND',
        message: 'Periode tidak ditemukan',
      });
    }

    // Already ended wins over a form error: the second admin needs to know, not to retype.
    assertCanEndEarly(
      {
        startDate: period.start_date,
        endDate: period.end_date,
        originalEndDate: period.original_end_date,
      },
      now,
    );
    const upcomingCount = creator.contracts.filter(
      (contract) => !periodHasStarted(contract.start_date, now),
    ).length;
    const request = checkEarlyEnd(
      body,
      { startDate: period.start_date, endDate: period.end_date, originalEndDate: null },
      now,
      upcomingCount,
    );
    if (request.invoice === 'cancel') {
      invoiceState(period.invoice?.status ?? 'running').assertCanCancel();
    }

    const contents = await client.contents.findMany({
      where: { contract_id: contractId },
      select: PLAN_CONTENT,
      orderBy: [{ deadline: 'asc' }, { id: 'asc' }],
    });
    const plan = planEarlyEnd(
      request,
      contractId,
      creator.contracts.map((contract) => ({
        id: contract.id,
        startDate: contract.start_date,
        endDate: contract.end_date,
        invoiceStatus: contract.invoice?.status ?? null,
      })),
      contents,
      now,
    );
    return { creator, period, request, plan };
  }

  /** Which of the creator's periods this is, counted from 1 in the order they started. */
  private periodNumber(creator: CreatorPeriods, period: PeriodRow): number {
    return (
      creator.contracts.filter(
        (contract) => contract.start_date.getTime() < period.start_date.getTime(),
      ).length + 1
    );
  }
}
