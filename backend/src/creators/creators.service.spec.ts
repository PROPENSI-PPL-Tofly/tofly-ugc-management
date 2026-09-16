import { NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { CLOCK, type Clock } from '../common/clock.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreatorsService } from './creators.service.js';

const TODAY = new Date('2026-09-16T00:00:00.000Z');

function day(offset: number): Date {
  const date = new Date(TODAY);
  date.setUTCDate(date.getUTCDate() + offset);
  return date;
}

interface ContentSeed {
  name?: string;
  deadlineOffset: number;
  submittedOffset?: number | null;
  submissions?: number;
  isProposal?: boolean;
}

interface CreatorSeed {
  id: string;
  firstName: string;
  lastName?: string | null;
  email: string;
  contracts?: { startOffset: number; endOffset: number; contents?: ContentSeed[] }[];
}

/** Builds the shape `prisma.creator.findMany` returns for the service's include tree. */
function creatorRow(seed: CreatorSeed) {
  return {
    id: seed.id,
    firstName: seed.firstName,
    middleName: null,
    lastName: seed.lastName ?? null,
    phoneNumber: '081234567890',
    accessRevokeDate: null,
    user: { email: seed.email },
    socialAccounts: [
      { platform: 'instagram', username: `${seed.firstName.toLowerCase()}.ig`, isConnected: true },
    ],
    contracts: (seed.contracts ?? []).map((contract, contractIndex) => ({
      id: `${seed.id}-contract-${contractIndex}`,
      startDate: day(contract.startOffset),
      endDate: day(contract.endOffset),
      daysBetween: 14,
      contentQuota: 4,
      contents: (contract.contents ?? []).map((content, contentIndex) => ({
        id: `${seed.id}-content-${contractIndex}-${contentIndex}`,
        name: content.name ?? `Konten ${contentIndex + 1}`,
        type: 'evergreen',
        deadline: day(content.deadlineOffset),
        status: content.submittedOffset == null ? 'scheduled' : 'link_submitted',
        isProposal: content.isProposal ?? false,
        videoLink: content.submittedOffset == null ? null : 'https://example.com/reel',
        videoSubmittedAt:
          content.submittedOffset == null ? null : day(content.submittedOffset),
        _count: { submissions: content.submissions ?? (content.submittedOffset == null ? 0 : 1) },
      })),
    })),
  };
}

/** Punctual, one revision overall: lands in the "Baik" band. */
const rangga = creatorRow({
  id: 'creator-rangga',
  firstName: 'Rangga',
  lastName: 'Pratama',
  email: 'rangga@example.com',
  contracts: [
    {
      startOffset: -100,
      endOffset: 100,
      contents: [
        { deadlineOffset: -60, submittedOffset: -62 },
        { deadlineOffset: -30, submittedOffset: -35, submissions: 2 },
        { deadlineOffset: 30 },
      ],
    },
  ],
});

/** Half the work late: "Perlu Perhatian". */
const dimas = creatorRow({
  id: 'creator-dimas',
  firstName: 'Dimas',
  lastName: 'Aji',
  email: 'dimas@example.com',
  contracts: [
    {
      startOffset: -120,
      endOffset: 60,
      contents: [
        { deadlineOffset: -80, submittedOffset: -81 },
        { deadlineOffset: -20 },
      ],
    },
  ],
});

/** Contract finished, everything delivered on time. */
const salsa = creatorRow({
  id: 'creator-salsa',
  firstName: 'Salsa',
  lastName: 'Amelia',
  email: 'salsa@example.com',
  contracts: [
    {
      startOffset: -400,
      endOffset: -220,
      contents: [{ deadlineOffset: -380, submittedOffset: -382 }],
    },
    {
      startOffset: -200,
      endOffset: -30,
      contents: [
        { deadlineOffset: -150, submittedOffset: -152 },
        { deadlineOffset: -100, submittedOffset: -101 },
      ],
    },
  ],
});

/** Mostly missed deadlines: "Berisiko". */
const bagas = creatorRow({
  id: 'creator-bagas',
  firstName: 'Bagas',
  lastName: 'Wicaksono',
  email: 'bagas@example.com',
  contracts: [
    {
      startOffset: -120,
      endOffset: 80,
      contents: [
        { deadlineOffset: -90, submittedOffset: -95 },
        { deadlineOffset: -60, submissions: 3 },
        { deadlineOffset: -30, submissions: 2 },
      ],
    },
  ],
});

/** Contract just started, nothing due yet. */
const intan = creatorRow({
  id: 'creator-intan',
  firstName: 'Intan',
  lastName: 'Maharani',
  email: 'intan@example.com',
  contracts: [
    { startOffset: -10, endOffset: 160, contents: [{ deadlineOffset: 20 }, { deadlineOffset: 40 }] },
  ],
});

const ALL_CREATORS = [rangga, dimas, salsa, bagas, intan];

describe('CreatorsService', () => {
  let service: CreatorsService;
  let findMany: ReturnType<typeof vi.fn>;
  let findUnique: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    findMany = vi.fn().mockResolvedValue(ALL_CREATORS);
    findUnique = vi.fn().mockResolvedValue(null);

    const clock: Clock = { now: () => TODAY };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreatorsService,
        { provide: PrismaService, useValue: { creator: { findMany, findUnique } } },
        { provide: CLOCK, useValue: clock },
      ],
    }).compile();

    service = module.get(CreatorsService);
  });

  describe('list', () => {
    it('summarises every creator with identity, contract and performance', async () => {
      const result = await service.list({});

      expect(result.total).toBe(5);
      expect(result.items).toHaveLength(5);

      const summary = result.items.find((item) => item.id === 'creator-rangga');
      expect(summary).toMatchObject({
        name: 'Rangga Pratama',
        email: 'rangga@example.com',
        socials: { instagram: 'rangga.ig' },
        contract: {
          status: 'active',
          daysRemaining: 100,
          periodNumber: 1,
          contentQuota: 4,
        },
        progress: { submitted: 2, total: 3, percent: 67 },
        performance: {
          onTimeRate: 100,
          avgRevisions: 0.5,
          productivity: 'good',
          productivityLabel: 'Baik',
        },
      });
    });

    it('reports dates as plain calendar days', async () => {
      const result = await service.list({});
      const summary = result.items.find((item) => item.id === 'creator-rangga');

      expect(summary?.contract.startDate).toBe('2026-06-08');
      expect(summary?.contract.endDate).toBe('2026-12-25');
    });

    it('describes a finished contract as expired and numbers the renewal', async () => {
      const result = await service.list({});
      const summary = result.items.find((item) => item.id === 'creator-salsa');

      expect(summary?.contract).toMatchObject({
        status: 'expired',
        periodNumber: 2,
        daysRemaining: -30,
      });
      expect(summary?.performance.onTimeRate).toBe(100);
    });

    it('sorts creators by name so the page order is stable', async () => {
      const result = await service.list({});

      expect(result.items.map((item) => item.name)).toEqual([
        'Bagas Wicaksono',
        'Dimas Aji',
        'Intan Maharani',
        'Rangga Pratama',
        'Salsa Amelia',
      ]);
    });

    it('matches the search term against the name', async () => {
      const result = await service.list({ q: 'rangga' });

      expect(result.items.map((item) => item.id)).toEqual(['creator-rangga']);
      expect(result.total).toBe(1);
    });

    it('matches the search term against the email, ignoring case and padding', async () => {
      const result = await service.list({ q: '  SALSA@EXAMPLE.COM  ' });

      expect(result.items.map((item) => item.id)).toEqual(['creator-salsa']);
    });

    it('returns nothing when the search matches no one', async () => {
      const result = await service.list({ q: 'tidak ada' });

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('filters by contract status', async () => {
      const active = await service.list({ contract: 'active' });
      const expired = await service.list({ contract: 'expired' });

      expect(active.items.map((item) => item.id)).not.toContain('creator-salsa');
      expect(expired.items.map((item) => item.id)).toEqual(['creator-salsa']);
    });

    it('filters by productivity band', async () => {
      const risky = await service.list({ productivity: 'risk' });

      expect(risky.items.map((item) => item.id)).toEqual(['creator-bagas']);
    });

    it('combines search and filters', async () => {
      const result = await service.list({ q: 'a', contract: 'active', productivity: 'good' });

      expect(result.items.map((item) => item.id)).toEqual(['creator-rangga']);
    });

    it('keeps the headline counts over every creator, not the filtered page', async () => {
      const result = await service.list({ q: 'rangga' });

      expect(result.stats).toEqual({ total: 5, active: 4, good: 2, risk: 1 });
    });

    it('returns the requested page', async () => {
      const first = await service.list({ page: 1, pageSize: 2 });
      const second = await service.list({ page: 2, pageSize: 2 });

      expect(first.items.map((item) => item.name)).toEqual(['Bagas Wicaksono', 'Dimas Aji']);
      expect(second.items.map((item) => item.name)).toEqual(['Intan Maharani', 'Rangga Pratama']);
      expect(second).toMatchObject({ page: 2, pageSize: 2, total: 5, totalPages: 3 });
    });

    it('returns an empty page past the end rather than failing', async () => {
      const result = await service.list({ page: 9, pageSize: 2 });

      expect(result.items).toEqual([]);
      expect(result.total).toBe(5);
    });

    it('reports a single empty page when nothing matches', async () => {
      const result = await service.list({ q: 'tidak ada' });

      expect(result.totalPages).toBe(1);
    });
  });

  describe('findOne', () => {
    it('rejects an unknown creator', async () => {
      findUnique.mockResolvedValue(null);

      await expect(service.findOne('creator-missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the summary alongside contract history, content and drafts', async () => {
      findUnique.mockResolvedValue({
        ...salsa,
        contracts: salsa.contracts.map((contract) => ({
          ...contract,
          contents: contract.contents.map((content) => ({
            ...content,
            submissions: [
              {
                id: `${content.id}-submission-1`,
                link: 'https://drive.example.com/draft-1',
                revisionNotes: null,
                createdAt: day(-200),
              },
              {
                id: `${content.id}-submission-2`,
                link: 'https://drive.example.com/draft-2',
                revisionNotes: 'Audio diperbaiki.',
                createdAt: day(-198),
              },
            ],
          })),
        })),
      });

      const detail = await service.findOne('creator-salsa');

      expect(detail).toMatchObject({
        id: 'creator-salsa',
        name: 'Salsa Amelia',
        phoneNumber: '081234567890',
        contract: { status: 'expired', periodNumber: 2 },
      });

      expect(detail.contractHistory).toEqual([
        expect.objectContaining({ periodNumber: 1, completed: 1, total: 1, isCurrent: false }),
        expect.objectContaining({ periodNumber: 2, completed: 2, total: 2, isCurrent: true }),
      ]);

      expect(detail.contents).toHaveLength(2);
      expect(detail.contents[0]).toMatchObject({ outcome: 'on_time', deadline: '2026-04-19' });

      expect(detail.drafts[0]).toMatchObject({
        revisionCount: 1,
        latestLink: 'https://drive.example.com/draft-2',
      });
    });

    it('describes the content of the current contract only', async () => {
      findUnique.mockResolvedValue({
        ...salsa,
        contracts: salsa.contracts.map((contract) => ({
          ...contract,
          contents: contract.contents.map((content) => ({ ...content, submissions: [] })),
        })),
      });

      const detail = await service.findOne('creator-salsa');

      expect(detail.contents.map((content) => content.name)).toEqual(['Konten 1', 'Konten 2']);
    });
  });
});
