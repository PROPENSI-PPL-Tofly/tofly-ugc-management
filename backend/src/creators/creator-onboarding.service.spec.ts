import { UnprocessableEntityException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreatorOnboardingService } from './creator-onboarding.service.js';
import type { NewCreator } from './new-creator.js';

/** A calendar day as Postgres `date` columns hold it: midnight UTC. */
function day(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function newCreator(overrides: Partial<NewCreator> = {}): NewCreator {
  return {
    firstName: 'Salsa',
    middleName: 'Putri',
    lastName: 'Amelia',
    email: 'salsa@example.com',
    socialPlatform: 'instagram',
    socialUsername: 'salsa.amelia',
    contractStart: day('2026-10-01'),
    contractEnd: day('2026-12-31'),
    interval: 7,
    quota: 2,
    fixedRate: 500000,
    deadlines: [day('2026-10-06'), day('2026-10-13')],
    ...overrides,
  };
}

function knownError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(`Prisma error ${code}`, {
    code,
    clientVersion: Prisma.prismaVersion.client,
  });
}

describe('CreatorOnboardingService', () => {
  let service: CreatorOnboardingService;

  // Only the one call the service makes; the database itself is out of the picture.
  const prisma = { users: { create: vi.fn() } };

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma.users.create.mockResolvedValue({ creators: { id: 'creator-9' } });

    const module = await Test.createTestingModule({
      providers: [
        CreatorOnboardingService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(CreatorOnboardingService);
  });

  // One nested create is one statement Prisma runs in one transaction: the login, the profile,
  // the social account, the contract and its schedule are saved together or not at all.
  it('saves the login, profile, social account, contract and schedule in one nested create', async () => {
    await expect(service.create(newCreator())).resolves.toEqual({
      id: 'creator-9',
    });

    expect(prisma.users.create).toHaveBeenCalledTimes(1);
    expect(prisma.users.create).toHaveBeenCalledWith({
      data: {
        email: 'salsa@example.com',
        creators: {
          create: {
            first_name: 'Salsa',
            middle_name: 'Putri',
            last_name: 'Amelia',
            social_accounts: {
              create: { platform: 'instagram', username: 'salsa.amelia' },
            },
            contracts: {
              create: {
                start_date: day('2026-10-01'),
                end_date: day('2026-12-31'),
                days_between: 7,
                content_quota: 2,
                fixed_rate: 500000,
                contents: {
                  create: [
                    {
                      name: 'Evg_1_Salsa Putri Amelia_06102026',
                      type: 'evergreen',
                      deadline: day('2026-10-06'),
                    },
                    {
                      name: 'Evg_2_Salsa Putri Amelia_13102026',
                      type: 'evergreen',
                      deadline: day('2026-10-13'),
                    },
                  ],
                },
              },
            },
          },
        },
      },
      select: { creators: { select: { id: true } } },
    });
  });

  it('titles the schedule with the name as the table shows it', async () => {
    await service.create(
      newCreator({
        firstName: 'Salsa',
        middleName: null,
        lastName: null,
        quota: 1,
        deadlines: [day('2026-10-06')],
      }),
    );

    const [{ data }] = prisma.users.create.mock.calls[0];
    expect(data.creators.create).toMatchObject({
      first_name: 'Salsa',
      middle_name: null,
      last_name: null,
    });
    expect(data.creators.create.contracts.create.contents.create).toEqual([
      {
        name: 'Evg_1_Salsa_06102026',
        type: 'evergreen',
        deadline: day('2026-10-06'),
      },
    ]);
  });

  // users.email is the whitelist; its unique index sees every creator and admin, not just the
  // page of the table the modal had loaded.
  it('answers an email already on the whitelist with a 422 on the email field', async () => {
    prisma.users.create.mockRejectedValue(knownError('P2002'));

    const attempt = service.create(newCreator());

    await expect(attempt).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(attempt).rejects.toMatchObject({
      response: {
        message: 'Data creator tidak valid',
        errors: { email: 'Email sudah terdaftar' },
      },
    });
  });

  it.each([
    ['another Prisma error', knownError('P2003')],
    ['an unexpected error', new Error('connection reset')],
  ])('lets %s through unchanged', async (_case, error) => {
    prisma.users.create.mockRejectedValue(error);

    await expect(service.create(newCreator())).rejects.toBe(error);
  });
});
