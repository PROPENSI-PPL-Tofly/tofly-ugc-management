import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuditAction } from '../audit/audit-actions.js';
import {
  AuditLogger,
  type AuditActorReader,
  type AuditWriter,
} from '../audit/audit-logger.js';
import { lockContractRow } from '../invoices/contract-lock.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  overlappingPeriod,
  periodHasStarted,
  specificOutsidePeriod,
} from './contract-period.js';
import { evergreenSchedule } from './creator-onboarding.service.js';
import type { SavedPeriod } from './dto/contract-period.dto.js';
import { joinName } from './evergreen.js';
import type { ContractTerms } from './new-creator.js';
import { DEFAULT_BUFFER_DAYS } from '../deadline-buffer/deadline-window.js';

/** The creator and every period they have, with the Specific content an edit must keep in range. */
const CREATOR_PERIODS = {
  first_name: true,
  middle_name: true,
  last_name: true,
  contracts: {
    select: {
      id: true,
      start_date: true,
      end_date: true,
      contract_type: true,
      days_between: true,
      content_quota: true,
      fixed_rate: true,
      contents: {
        where: { type: 'specific' },
        select: { name: true, deadline: true },
      },
    },
  },
} satisfies Prisma.creatorsSelect;

type CreatorPeriods = Prisma.creatorsGetPayload<{ select: typeof CREATOR_PERIODS }>;
type PeriodRow = CreatorPeriods['contracts'][number];

const SAVED_SELECT = {
  id: true,
  start_date: true,
  end_date: true,
  invoice: { select: { id: true } },
  contents: {
    where: { type: 'evergreen' },
    select: { id: true, name: true, deadline: true },
    orderBy: { deadline: 'asc' },
  },
} satisfies Prisma.contractsSelect;

type SavedRow = Prisma.contractsGetPayload<{ select: typeof SAVED_SELECT }>;

type PeriodsTransaction = Pick<
  Prisma.TransactionClient,
  '$queryRaw' | 'creators' | 'contracts' | 'contents'
> &
  AuditWriter &
  AuditActorReader;

/** The slice of the database client periods touch; tests hand in a stub of just that. */
export interface PeriodsClient {
  $transaction<T>(work: (tx: PeriodsTransaction) => Promise<T>): Promise<T>;
}

function toDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function invalid(errors: Record<string, string>): UnprocessableEntityException {
  return new UnprocessableEntityException({
    message: 'Data periode tidak valid',
    errors,
  });
}

/** The contract columns the period's terms set, the same ones onboarding fills. */
function contractColumns(terms: ContractTerms) {
  return {
    start_date: terms.contractStart,
    end_date: terms.contractEnd,
    contract_type: terms.contractType,
    days_between: terms.interval,
    content_quota: terms.quota,
    fixed_rate: terms.fixedRate,
  };
}

// A period's terms as Log Aktivitas keeps them: plain days and numbers, never a Prisma Decimal.
function termsForLog(terms: ContractTerms): Record<string, unknown> {
  return {
    startDate: toDay(terms.contractStart),
    endDate: toDay(terms.contractEnd),
    contractType: terms.contractType,
    interval: terms.interval,
    quota: terms.quota,
    fixedRate: terms.fixedRate,
  };
}

function storedTermsForLog(period: PeriodRow): Record<string, unknown> {
  return {
    startDate: toDay(period.start_date),
    endDate: toDay(period.end_date),
    contractType: period.contract_type,
    interval: period.days_between,
    quota: period.content_quota,
    fixedRate: Number(period.fixed_rate),
  };
}

function toSaved(row: SavedRow): SavedPeriod {
  return {
    contractId: row.id,
    invoiceId: row.invoice?.id ?? null,
    startDate: toDay(row.start_date),
    endDate: toDay(row.end_date),
    contents: row.contents.map((content) => ({
      id: content.id,
      name: content.name,
      deadline: toDay(content.deadline),
    })),
  };
}

/** What the period endpoints need, so the controller can inject or stub them by contract. */
export interface PeriodKeeper {
  create(creatorId: string, terms: ContractTerms, now: Date, adminUserId?: string): Promise<SavedPeriod>;
  update(
    creatorId: string,
    contractId: string,
    terms: ContractTerms,
    now: Date,
    adminUserId?: string,
  ): Promise<SavedPeriod>;
  remove(
    creatorId: string,
    contractId: string,
    now: Date,
    adminUserId?: string,
  ): Promise<void>;
}

/**
 * A creator's contract periods (PBI-30): "Perpanjang Kontrak" adds one, and a period that has not
 * started can be edited or deleted. Each write runs in one transaction that first locks the
 * creator row, so two admins can never both pass the overlap check, and an edit or delete also
 * takes the contract lock Finalize takes. Earlier periods and their invoices are never touched.
 */
@Injectable()
export class ContractPeriodsService implements PeriodKeeper {
  constructor(
    @Inject(PrismaService) private readonly prisma: PeriodsClient,
    @Optional()
    @Inject(AuditLogger)
    private readonly audit: AuditLogger = new AuditLogger(),
  ) {}

  create(
    creatorId: string,
    terms: ContractTerms,
    now: Date,
    adminUserId?: string,
  ): Promise<SavedPeriod> {
    return this.prisma.$transaction(async (tx) => {
      const creator = await this.lockCreator(tx, creatorId);
      this.refuseOverlap(terms, creator.contracts);

      const row = await tx.contracts.create({
        data: {
          creator_id: creatorId,
          ...contractColumns(terms),
          // Its own invoice from the start: access and Finalize read the contract's invoice.
          invoice: { create: {} },
          contents: { create: this.schedule(creator, terms, now, adminUserId) },
        },
        select: SAVED_SELECT,
      });
      await this.log(tx, 'contract_extended', creator, creatorId, row.id, adminUserId, {
        newValues: termsForLog(terms),
      });
      return toSaved(row);
    });
  }

  update(
    creatorId: string,
    contractId: string,
    terms: ContractTerms,
    now: Date,
    adminUserId?: string,
  ): Promise<SavedPeriod> {
    return this.prisma.$transaction(async (tx) => {
      const creator = await this.lockCreator(tx, creatorId);
      const period = await this.lockUnstarted(tx, creator, contractId, now, 'diubah');

      this.refuseOverlap(
        terms,
        creator.contracts.filter((other) => other.id !== contractId),
      );
      const stranded = specificOutsidePeriod(
        terms,
        period.contents,
        now, DEFAULT_BUFFER_DAYS,
      );
      if (stranded) {
        throw invalid({ contents: stranded });
      }

      // The schedule is generated again from the new terms (AC 8); Specific content stays.
      await tx.contents.deleteMany({
        where: { contract_id: contractId, type: 'evergreen' },
      });
      const row = await tx.contracts.update({
        where: { id: contractId },
        data: {
          ...contractColumns(terms),
          updated_at: now,
          contents: { create: this.schedule(creator, terms, now, adminUserId) },
        },
        select: SAVED_SELECT,
      });
      await this.log(tx, 'period_changed', creator, creatorId, contractId, adminUserId, {
        oldValues: storedTermsForLog(period),
        newValues: termsForLog(terms),
      });
      return toSaved(row);
    });
  }

  /**
   * Deletes a period that has not started; its contents, their history and its empty invoice
   * cascade with it. The deletion is recorded in "Log Aktivitas" (AC 9) inside this transaction.
   */
  remove(
    creatorId: string,
    contractId: string,
    now: Date,
    adminUserId?: string,
  ): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      const creator = await this.lockCreator(tx, creatorId);
      const period = await this.lockUnstarted(tx, creator, contractId, now, 'dihapus');

      if (creator.contracts.length === 1) {
        throw new ConflictException({
          code: 'LAST_PERIOD',
          message: 'Periode satu-satunya creator tidak bisa dihapus',
        });
      }
      await tx.contracts.delete({ where: { id: contractId } });
      await this.log(tx, 'period_deleted', creator, creatorId, contractId, adminUserId, {
        oldValues: storedTermsForLog(period),
      });
    });
  }

  // On the write's own transaction, so a period never changes without its entry (OWASP A09:2025).
  private async log(
    tx: PeriodsTransaction,
    action: AuditAction,
    creator: CreatorPeriods,
    creatorId: string,
    contractId: string,
    adminUserId: string | undefined,
    values: { oldValues?: Record<string, unknown>; newValues?: Record<string, unknown> },
  ): Promise<void> {
    await this.audit.recordBy(tx, adminUserId, {
      action,
      target: { id: contractId, label: joinName(creator) },
      creatorId,
      ...values,
    });
  }

  /** Locks the creator row until the transaction ends, then reads them with every period. */
  private async lockCreator(
    tx: PeriodsTransaction,
    creatorId: string,
  ): Promise<CreatorPeriods> {
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM creators WHERE id = ${creatorId}::uuid FOR UPDATE`,
    );
    const creator = await tx.creators.findUnique({
      where: { id: creatorId },
      select: CREATOR_PERIODS,
    });
    if (!creator) {
      throw new NotFoundException({
        code: 'CREATOR_NOT_FOUND',
        message: 'Creator tidak ditemukan',
      });
    }
    return creator;
  }

  /**
   * The creator's own period, locked as Finalize locks it, while it has not started. A period of
   * another creator is a 404 like a missing one, so an id never reveals whose contract it is.
   */
  private async lockUnstarted(
    tx: PeriodsTransaction,
    creator: CreatorPeriods,
    contractId: string,
    now: Date,
    action: 'diubah' | 'dihapus',
  ): Promise<PeriodRow> {
    const period = creator.contracts.find((contract) => contract.id === contractId);
    if (!period) {
      throw new NotFoundException({
        code: 'PERIOD_NOT_FOUND',
        message: 'Periode tidak ditemukan',
      });
    }
    await lockContractRow(tx, contractId);
    if (periodHasStarted(period.start_date, now)) {
      throw new ConflictException({
        code: 'PERIOD_STARTED',
        message: `Periode sudah dimulai dan tidak bisa ${action}`,
      });
    }
    return period;
  }

  private refuseOverlap(terms: ContractTerms, others: readonly PeriodRow[]): void {
    const clash = overlappingPeriod(
      terms,
      others.map((other) => ({ startDate: other.start_date, endDate: other.end_date })),
    );
    if (clash) {
      throw invalid({ contractStart: clash });
    }
  }

  private schedule(
    creator: CreatorPeriods,
    terms: ContractTerms,
    now: Date,
    adminUserId: string | undefined,
  ) {
    return evergreenSchedule(
      joinName(creator),
      terms.deadlines.map(toDay),
      now,
      adminUserId ?? null,
    );
  }
}
