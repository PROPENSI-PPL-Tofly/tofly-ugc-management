import { UnprocessableEntityException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { CreatorOnboardingService } from '../src/creators/creator-onboarding.service.js';
import type { NewCreator } from '../src/creators/dto/new-creator.dto.js';
import { jakartaDay } from '../src/creators/evergreen.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Rows created here carry this marker so the cleanup never touches anything else in the
// database, seeded or not.
const MARKER = 'e2e-onboarding';

/** Today in WIB plus `offset` days, as an ISO calendar day. */
function day(offset: number): string {
  const today = new Date(`${jakartaDay(new Date())}T00:00:00Z`);
  today.setUTCDate(today.getUTCDate() + offset);
  return today.toISOString().slice(0, 10);
}

function newCreator(overrides: Partial<NewCreator> = {}): NewCreator {
  return {
    name: `${MARKER} Aulia Rahma`,
    email: `${MARKER}-aulia@example.com`,
    contractStart: day(0),
    contractEnd: day(60),
    interval: 14,
    quota: 3,
    fixedRate: 1500000,
    socialPlatform: 'instagram',
    socialUsername: 'aulia.creates',
    contractType: 'probation',
    deadlines: [day(14), day(28), day(42)],
    ...overrides,
  };
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the promise to reject');
}

describe('CreatorOnboardingService (e2e)', () => {
  let moduleRef: TestingModule;
  let onboarding: CreatorOnboardingService;
  let prisma: PrismaService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    await moduleRef.init();
    onboarding = moduleRef.get(CreatorOnboardingService);
    prisma = moduleRef.get(PrismaService);
  });

  afterEach(async () => {
    await prisma.creators.deleteMany({
      where: { first_name: { startsWith: MARKER } },
    });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARKER } } });
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('whitelists the email and stores the contract with its Evergreen contents', async () => {
    const created = await onboarding.onboard(newCreator());

    const user = await prisma.users.findUniqueOrThrow({
      where: { email: `${MARKER}-aulia@example.com` },
      select: {
        is_admin: true,
        creators: {
          select: {
            id: true,
            social_accounts: { select: { platform: true, username: true } },
            contracts: {
              select: {
                id: true,
                content_quota: true,
                contract_type: true,
                contents: {
                  select: { name: true, type: true, status: true, brief: true },
                  orderBy: { deadline: 'asc' },
                },
              },
            },
          },
        },
      },
    });

    expect(user.is_admin).toBe(false);
    expect(user.creators?.id).toBe(created.id);
    expect(user.creators?.social_accounts).toEqual([
      { platform: 'instagram', username: 'aulia.creates' },
    ]);
    expect(user.creators?.contracts).toHaveLength(1);
    expect(user.creators?.contracts[0].id).toBe(created.contractId);
    expect(user.creators?.contracts[0].contract_type).toBe('probation');
    expect(user.creators?.contracts[0].contents).toEqual(
      [day(14), day(28), day(42)].map((deadline, index) => {
        const [year, month, date] = deadline.split('-');
        return {
          name: `Evg_${index + 1}_${MARKER} Aulia Rahma_${date}${month}${year}`,
          type: 'evergreen',
          status: 'scheduled',
          brief: '',
        };
      }),
    );
  });

  // citext makes the unique index case-insensitive, so the second insert fails inside the
  // same nested write and takes its creator, contract and contents down with it.
  it('rejects the same email in another case and leaves nothing half-created', async () => {
    await onboarding.onboard(newCreator());

    const error = await rejection(
      onboarding.onboard(
        newCreator({
          name: `${MARKER} Aulia Kedua`,
          email: `${MARKER}-AULIA@example.com`,
        }),
      ),
    );

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toMatchObject(
      { errors: { email: 'Email sudah terdaftar' } },
    );
    await expect(
      prisma.creators.count({ where: { first_name: { startsWith: MARKER } } }),
    ).resolves.toBe(1);
    await expect(
      prisma.contracts.count({
        where: { creators: { first_name: { startsWith: MARKER } } },
      }),
    ).resolves.toBe(1);
  });

  it('stores two contents that share one deadline under their own sequence numbers', async () => {
    await onboarding.onboard(
      newCreator({ deadlines: [day(14), day(14), day(42)] }),
    );

    const contents = await prisma.contents.findMany({
      where: {
        contracts: { creators: { first_name: { startsWith: MARKER } } },
      },
      select: { name: true },
      orderBy: { name: 'asc' },
    });

    const [year, month, date] = day(14).split('-');
    expect(contents.map((content) => content.name).slice(0, 2)).toEqual([
      `Evg_1_${MARKER} Aulia Rahma_${date}${month}${year}`,
      `Evg_2_${MARKER} Aulia Rahma_${date}${month}${year}`,
    ]);
  });

  it('writes nothing when the deadlines do not fit the contract', async () => {
    const error = await rejection(
      onboarding.onboard(
        newCreator({ deadlines: [day(14), day(28), day(61)] }),
      ),
    );

    expect((error as UnprocessableEntityException).getResponse()).toMatchObject(
      {
        errors: { deadlines: 'Deadline harus di dalam periode kontrak' },
      },
    );
    await expect(
      prisma.users.count({ where: { email: { startsWith: MARKER } } }),
    ).resolves.toBe(0);
  });
});
