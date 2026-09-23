import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { NewCreator, OnboardedCreator } from './dto/new-creator.dto.js';
import { evergreenName, splitName } from './evergreen.js';

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
    const name = input.name.trim();
    const deadlines = [...input.deadlines].sort((a, b) => a.localeCompare(b));

    const row = await this.prisma.creators.create({
      data: {
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
            days_between: input.interval,
            content_quota: input.quota,
            fixed_rate: input.fixedRate,
            contents: {
              create: deadlines.map((day) => ({
                name: evergreenName(name, day),
                type: 'evergreen' as const,
                brief: '',
                deadline: toDate(day),
                status: 'scheduled' as const,
              })),
            },
          },
        },
      },
      select: ONBOARDED_SELECT,
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
