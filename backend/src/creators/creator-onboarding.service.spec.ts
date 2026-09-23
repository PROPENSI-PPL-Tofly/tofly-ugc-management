import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreatorOnboardingService } from './creator-onboarding.service.js';
import type { NewCreator } from './dto/new-creator.dto.js';

// 10:00 WIB on 12 September 2026.
const NOW = new Date('2026-09-12T03:00:00Z');

function day(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

const INPUT: NewCreator = {
  name: 'Rangga Pratama',
  email: 'rangga@example.com',
  contractStart: '2026-09-12',
  contractEnd: '2026-11-12',
  interval: 14,
  quota: 2,
  fixedRate: 1500000,
  socialPlatform: 'instagram',
  socialUsername: 'rangga.creates',
  deadlines: ['2026-10-10', '2026-09-26'],
};

// What the database hands back for INPUT: the stub stands in for Postgres so the service's
// own logic is tested in isolation, without a connection.
const CREATED = {
  id: 'creator-1',
  users: { email: 'rangga@example.com' },
  contracts: [
    {
      id: 'contract-1',
      contents: [
        {
          id: 'content-1',
          name: 'Evg_RanggaPratama_26092026',
          deadline: day('2026-09-26'),
        },
        {
          id: 'content-2',
          name: 'Evg_RanggaPratama_10102026',
          deadline: day('2026-10-10'),
        },
      ],
    },
  ],
};

describe('CreatorOnboardingService', () => {
  const prisma = { creators: { create: vi.fn() } };
  let service: CreatorOnboardingService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        CreatorOnboardingService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(CreatorOnboardingService);
  });

  it('whitelists the email with the creator, contract and Evergreen contents in one write', async () => {
    prisma.creators.create.mockResolvedValue(CREATED);

    await service.onboard(INPUT, NOW);

    expect(prisma.creators.create).toHaveBeenCalledTimes(1);
    expect(prisma.creators.create.mock.calls[0][0].data).toEqual({
      first_name: 'Rangga',
      middle_name: null,
      last_name: 'Pratama',
      users: { create: { email: 'rangga@example.com' } },
      social_accounts: {
        create: { platform: 'instagram', username: 'rangga.creates' },
      },
      contracts: {
        create: {
          start_date: day('2026-09-12'),
          end_date: day('2026-11-12'),
          days_between: 14,
          content_quota: 2,
          fixed_rate: 1500000,
          contents: {
            create: [
              {
                name: 'Evg_RanggaPratama_26092026',
                type: 'evergreen',
                brief: '',
                deadline: day('2026-09-26'),
                status: 'scheduled',
              },
              {
                name: 'Evg_RanggaPratama_10102026',
                type: 'evergreen',
                brief: '',
                deadline: day('2026-10-10'),
                status: 'scheduled',
              },
            ],
          },
        },
      },
    });
  });

  it('trims the name and email before storing them', async () => {
    prisma.creators.create.mockResolvedValue(CREATED);

    await service.onboard(
      { ...INPUT, name: '  Rangga Pratama ', email: ' rangga@example.com ' },
      NOW,
    );

    const { data } = prisma.creators.create.mock.calls[0][0];
    expect(data.users).toEqual({ create: { email: 'rangga@example.com' } });
    expect(data.contracts.create.contents.create[0].name).toBe(
      'Evg_RanggaPratama_26092026',
    );
  });

  it('returns the creator, contract and generated contents as calendar days', async () => {
    prisma.creators.create.mockResolvedValue(CREATED);

    await expect(service.onboard(INPUT, NOW)).resolves.toEqual({
      id: 'creator-1',
      email: 'rangga@example.com',
      contractId: 'contract-1',
      contents: [
        {
          id: 'content-1',
          name: 'Evg_RanggaPratama_26092026',
          deadline: '2026-09-26',
        },
        {
          id: 'content-2',
          name: 'Evg_RanggaPratama_10102026',
          deadline: '2026-10-10',
        },
      ],
    });
  });

  it('judges "today" in WIB, so a contract starting today is accepted just after midnight', async () => {
    prisma.creators.create.mockResolvedValue(CREATED);

    // 00:30 WIB on the 12th is still the 11th in UTC.
    await service.onboard(INPUT, new Date('2026-09-11T17:30:00Z'));

    expect(prisma.creators.create).toHaveBeenCalledTimes(1);
  });

  it('defaults to the current time when no clock is passed', async () => {
    vi.useFakeTimers({ now: NOW });
    try {
      prisma.creators.create.mockResolvedValue(CREATED);
      await service.onboard(INPUT);
      expect(prisma.creators.create).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
