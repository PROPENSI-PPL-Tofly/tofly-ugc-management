import {
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { planEvergreen } from './evergreen-planner.js';
import type { NewCreator } from './new-creator.js';

/** What POST /creators answers with: the new creator's id. */
export interface CreatedCreator {
  id: string;
}

/** What the controller needs to add a creator, kept apart from CreatorLister's read side. */
export interface CreatorOnboarder {
  create(creator: NewCreator): Promise<CreatedCreator>;
}

/** The slice of the database client onboarding touches; tests hand in a stub of just that. */
export type OnboardingClient = Pick<PrismaService, 'users'>;

/** Prisma's code for a unique-constraint violation. */
const UNIQUE_VIOLATION = 'P2002';

@Injectable()
export class CreatorOnboardingService implements CreatorOnboarder {
  constructor(
    @Inject(PrismaService) private readonly prisma: OnboardingClient,
  ) {}

  /**
   * Whitelists the email and creates the creator, their social account, their first contract
   * and its Evergreen schedule as one nested write, which Prisma runs in a single transaction:
   * an admin never ends up with a login that has no creator behind it, or a creator with no
   * schedule. The data is spelled out field by field, so nothing from the request that is not
   * in NewCreator (users.is_admin above all) can reach the insert.
   */
  async create(creator: NewCreator): Promise<CreatedCreator> {
    const name = [creator.firstName, creator.middleName, creator.lastName]
      .filter(Boolean)
      .join(' ');

    try {
      const user = await this.prisma.users.create({
        data: {
          email: creator.email,
          creators: {
            create: {
              first_name: creator.firstName,
              middle_name: creator.middleName,
              last_name: creator.lastName,
              social_accounts: {
                create: {
                  platform: creator.socialPlatform,
                  username: creator.socialUsername,
                },
              },
              contracts: {
                create: {
                  start_date: creator.contractStart,
                  end_date: creator.contractEnd,
                  days_between: creator.interval,
                  content_quota: creator.quota,
                  fixed_rate: creator.fixedRate,
                  contents: {
                    create: planEvergreen(name, creator.deadlines).map(
                      (item) => ({ ...item, type: 'evergreen' as const }),
                    ),
                  },
                },
              },
            },
          },
        },
        select: { creators: { select: { id: true } } },
      });

      // creators is optional on a users row in general, but this statement just created it.
      return { id: (user.creators as { id: string }).id };
    } catch (error) {
      // Only users.email can collide here: every other unique column belongs to a row this
      // same statement is creating.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_VIOLATION
      ) {
        throw new UnprocessableEntityException({
          message: 'Data creator tidak valid',
          errors: { email: 'Email sudah terdaftar' },
        });
      }
      throw error;
    }
  }
}
