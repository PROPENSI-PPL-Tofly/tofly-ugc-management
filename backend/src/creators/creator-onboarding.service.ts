import {
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { NewCreator, OnboardedCreator } from './dto/new-creator.dto.js';
import {
  checkSchedule,
  evergreenName,
  jakartaDay,
  splitName,
  type ScheduleErrors,
} from './evergreen.js';

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
 * The whole onboarding as one nested create: the whitelisted login, the creator, their social
 * account, the contract and one Evergreen content per deadline, earliest first.
 */
function onboardingData(input: NewCreator): Prisma.creatorsCreateInput {
  const name = input.name.trim();
  const deadlines = [...input.deadlines].sort((a, b) => a.localeCompare(b));
  return {
    ...splitName(name),
    users: { create: { email: input.email.trim() } },
    social_accounts: {
      create: {
        platform: input.socialPlatform,
        username: input.socialUsername,
      },
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
          create: deadlines.map((day, index) => ({
            name: evergreenName(name, day, index + 1),
            type: 'evergreen',
            brief: '',
            deadline: toDate(day),
            status: 'scheduled',
          })),
        },
      },
    },
  };
}

/** The slice of the database client onboarding touches; tests hand in a stub of just that. */
export type OnboardingClient = Pick<PrismaService, 'creators'>;

/** What the Add Creator endpoint needs, so it can inject or stub onboarding by contract. */
export interface CreatorOnboarder {
  onboard(input: NewCreator, now?: Date): Promise<OnboardedCreator>;
}

@Injectable()
export class CreatorOnboardingService implements CreatorOnboarder {
  constructor(
    @Inject(PrismaService) private readonly prisma: OnboardingClient,
  ) {}

  /**
   * Whitelists the email and creates the creator, their contract and one Evergreen content
   * per deadline as a single nested write. Prisma runs a nested write in one transaction, so
   * a login never exists without its contract and schedule, or the other way round.
   */
  async onboard(
    input: NewCreator,
    now = new Date(),
  ): Promise<OnboardedCreator> {
    const errors = checkSchedule(input, jakartaDay(now));
    if (Object.keys(errors).length > 0) {
      throw invalid(errors);
    }

    // No lookup before the insert: the citext unique index on users.email is the check, so
    // two admins saving the same address at once cannot both succeed.
    const row = await this.prisma.creators
      .create({ data: onboardingData(input), select: ONBOARDED_SELECT })
      .catch((error: unknown) => {
        throw isEmailTaken(error)
          ? invalid({ email: 'Email sudah terdaftar' })
          : error;
      });

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
