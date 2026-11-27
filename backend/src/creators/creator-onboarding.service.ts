import {
  CREATOR_NOTIFIER,
  noCreatorEmail,
  type CreatorNotifier,
} from '../email/creator-notifier.js';
import {
  Inject,
  Injectable,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AuditLogger,
  type AuditActorReader,
  type AuditWriter,
} from '../audit/audit-logger.js';
import { adminActor } from '../contents/content-event-actors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { NewCreator, OnboardedCreator } from './dto/new-creator.dto.js';
import {
  checkSchedule,
  evergreenName,
  jakartaDay,
  splitName,
  type ScheduleErrors,
} from './evergreen.js';
import {
  CONTENT_SCHEDULING,
  type ContentScheduling,
} from '../deadline-buffer/deadline-scheduling.js';
import { DEFAULT_BUFFER_DAYS } from '../deadline-buffer/deadline-window.js';

const ONBOARDED_SELECT = {
  id: true,
  users: { select: { email: true } },
  contracts: {
    select: {
      id: true,
      contents: {
        select: { id: true, name: true, deadline: true },
        orderBy: { deadline: 'asc' },
      },
    },
  },
} satisfies Prisma.creatorsSelect;

type OnboardedRow = Prisma.creatorsGetPayload<{
  select: typeof ONBOARDED_SELECT;
}>;

/** Postgres `date` columns travel as midnight UTC in both directions. */
function toDate(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

function toDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

type FieldErrors = ScheduleErrors & { email?: string };

/** One body shape for every rejected field, so the form shows each message under its input. */
function invalid(errors: FieldErrors): UnprocessableEntityException {
  return new UnprocessableEntityException({
    code: 'VALIDATION_FAILED',
    message: 'Data creator tidak valid',
    errors,
  });
}

// users.email is the only unique column this write can collide on: the creator, contract and
// social account rows are all new, so their unique keys cannot already exist.
function isEmailTaken(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

/**
 * One Evergreen content per deadline, earliest first and numbered from 1 within the contract,
 * each starting its history with the admin who scheduled it. Onboarding and a new or edited
 * period (PBI-30) generate their schedules through this one function.
 */
export function evergreenSchedule(
  creatorName: string,
  days: readonly string[],
  now: Date,
  adminUserId: string | null,
): Prisma.contentsCreateWithoutContractsInput[] {
  const deadlines = [...days].sort((a, b) => a.localeCompare(b));
  return deadlines.map((day, index) => ({
    name: evergreenName(creatorName, day, index + 1),
    type: 'evergreen',
    brief: '',
    deadline: toDate(day),
    status: 'scheduled',
    content_events: {
      create: {
        event_type: 'Scheduled',
        ...adminActor(adminUserId),
        occurred_at: now,
        event_data: {},
      },
    },
  }));
}

/**
 * The whole onboarding as one nested create: the whitelisted login, the creator, their social
 * account, the contract and its Evergreen schedule.
 */
function onboardingData(
  input: NewCreator,
  now: Date,
  adminUserId: string | null,
): Prisma.creatorsCreateInput {
  const name = input.name.trim();
  return {
    ...splitName(name),
    users: { create: { email: input.email.trim() } },
    social_accounts: {
      create: input.socialAccounts.map(({ platform, username }) => ({
        platform,
        username,
      })),
    },
    contracts: {
      create: {
        start_date: toDate(input.contractStart),
        end_date: toDate(input.contractEnd),
        contract_type: input.contractType,
        days_between: input.interval,
        content_quota: input.quota,
        fixed_rate: input.fixedRate,
        contents: {
          create: evergreenSchedule(name, input.deadlines, now, adminUserId),
        },
      },
    },
  };
}

// What Log Aktivitas keeps of a new creator: who they are and their first contract.
function onboardingForLog(
  input: NewCreator,
  row: OnboardedRow,
): Record<string, unknown> {
  return {
    name: input.name.trim(),
    email: row.users.email,
    socialAccounts: input.socialAccounts,
    contract: {
      contractId: row.contracts[0].id,
      startDate: input.contractStart,
      endDate: input.contractEnd,
      contractType: input.contractType,
      interval: input.interval,
      quota: input.quota,
      fixedRate: input.fixedRate,
    },
  };
}

type OnboardingTransaction = Pick<Prisma.TransactionClient, 'creators'> &
  AuditWriter &
  AuditActorReader;

/** The slice of the database client onboarding touches; tests hand in a stub of just that. */
export interface OnboardingClient {
  $transaction<T>(work: (tx: OnboardingTransaction) => Promise<T>): Promise<T>;
}

/** What the Add Creator endpoint needs, so it can inject or stub onboarding by contract. */
export interface CreatorOnboarder {
  onboard(
    input: NewCreator,
    now?: Date,
    adminUserId?: string,
  ): Promise<OnboardedCreator>;
}

@Injectable()
export class CreatorOnboardingService implements CreatorOnboarder {
  constructor(
    @Inject(PrismaService) private readonly prisma: OnboardingClient,
    @Optional()
    @Inject(AuditLogger)
    private readonly audit: AuditLogger = new AuditLogger(),
    // The stored buffer from DeadlineBufferModule, as Tambah Konten takes it (SCRUM-298).
    @Optional()
    @Inject(CONTENT_SCHEDULING)
    private readonly scheduling: Pick<ContentScheduling, 'bufferDays'> = {
      bufferDays: async () => DEFAULT_BUFFER_DAYS,
    },
    @Optional()
    @Inject(CREATOR_NOTIFIER)
    private readonly notifier: Pick<
      CreatorNotifier,
      'accountReady'
    > = noCreatorEmail,
  ) {}

  /**
   * Whitelists the email and creates the creator, their contract and one Evergreen content
   * per deadline, with its "Log Aktivitas" entry, in one transaction, so a login never exists
   * without its contract, schedule and entry, or the other way round.
   */
  async onboard(
    input: NewCreator,
    now = new Date(),
    adminUserId?: string,
  ): Promise<OnboardedCreator> {
    const errors = checkSchedule(
      input,
      jakartaDay(now),
      await this.scheduling.bufferDays(),
    );
    if (Object.keys(errors).length > 0) {
      throw invalid(errors);
    }

    // No lookup before the insert: the citext unique index on users.email is the check, so
    // two admins saving the same address at once cannot both succeed.
    const row = await this.prisma
      .$transaction(async (tx) => {
        const created = await tx.creators.create({
          data: onboardingData(input, now, adminUserId ?? null),
          select: ONBOARDED_SELECT,
        });
        await this.audit.recordBy(tx, adminUserId, {
          action: 'creator_added',
          target: { id: created.id, label: input.name.trim() },
          creatorId: created.id,
          newValues: onboardingForLog(input, created),
        });
        return created;
      })
      .catch((error: unknown) => {
        throw isEmailTaken(error)
          ? invalid({ email: 'Email sudah dipakai' })
          : error;
      });

    // PBI-11 (AC 1, AC 9): once the account is saved; the email never fails it.
    await this.notifier.accountReady({ creatorId: row.id });
    return this.toOnboarded(row);
  }

  private toOnboarded(row: OnboardedRow): OnboardedCreator {
    const [contract] = row.contracts;
    return {
      id: row.id,
      email: row.users.email,
      contractId: contract.id,
      contents: contract.contents.map((content) => ({
        id: content.id,
        name: content.name,
        deadline: toDay(content.deadline),
      })),
    };
  }
}
