import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreatorsService, type CreatorRow } from './creators.service.js';

const TODAY = new Date('2026-09-18T00:00:00Z');

function day(offset: number): Date {
  return new Date(Date.UTC(2026, 8, 18 + offset));
}

function row(overrides: Partial<CreatorRow> = {}): CreatorRow {
  return {
    id: 'creator-1',
    first_name: 'Rangga',
    middle_name: null,
    last_name: 'Pratama',
    access_revoke_date: null,
    users: { email: 'rangga@example.com' },
    social_accounts: [
      { platform: 'instagram', username: 'rangga.creates' },
      { platform: 'tiktok', username: 'ranggacreates' },
    ],
    contracts: [
      {
        id: 'contract-1',
        start_date: day(-100),
        end_date: day(80),
        content_quota: 6,
        contract_type: 'regular',
        contents: [
          {
            deadline: day(-30),
            video_submitted_at: day(-31),
            status: 'link_submitted',
            _count: { submissions: 1 },
          },
          {
            deadline: day(-10),
            video_submitted_at: day(-8),
            status: 'link_submitted',
            _count: { submissions: 2 },
          },
          {
            deadline: day(20),
            video_submitted_at: null,
            status: 'scheduled',
            _count: { submissions: 0 },
          },
        ],
      },
    ],
    ...overrides,
  };
}

type DetailSubmissionRow = {
  id: string;
  link: string;
  revision_notes: string | null;
  created_at: Date;
};

type DetailContentRow = {
  id: string;
  name: string;
  type: string;
  deadline: Date;
  status: string;
  video_link: string | null;
  video_submitted_at: Date | null;
  approval_bypassed: boolean;
  _count: { submissions: number };
  submissions: DetailSubmissionRow[];
};

type DetailContractRow = {
  id: string;
  start_date: Date;
  end_date: Date;
  days_between: number;
  content_quota: number;
  contract_type: 'probation' | 'regular';
  contents: DetailContentRow[];
};

type DetailCreatorRow = {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string | null;
  phone_number: string | null;
  access_revoke_date: Date | null;
  users: {
    email: string;
  };
  social_accounts: {
    platform: string;
    username: string;
  }[];
  contracts: DetailContractRow[];
};

function detailRow(): DetailCreatorRow {
  return {
    id: 'creator-1',
    first_name: 'Rangga',
    middle_name: null,
    last_name: 'Pratama',
    phone_number: '081234567001',
    access_revoke_date: null,
    users: {
      email: 'rangga@example.com',
    },
    social_accounts: [
      {
        platform: 'instagram',
        username: 'rangga.creates',
      },
      {
        platform: 'tiktok',
        username: 'ranggacreates',
      },
    ],
    contracts: [
      {
        id: 'contract-1',
        start_date: day(-100),
        end_date: day(80),
        days_between: 180,
        content_quota: 6,
        contract_type: 'regular',
        contents: [
          {
            id: 'content-1',
            name: 'Evergreen - Tips Belajar Cepat',
            type: 'evergreen',
            deadline: day(-30),
            status: 'link_submitted',
            video_link: 'https://example.com/video-1',
            video_submitted_at: day(-31),
            approval_bypassed: false,
            _count: {
              submissions: 2,
            },
            submissions: [
              {
                id: 'submission-1',
                link: 'https://example.com/draft-v1',
                revision_notes: null,
                created_at: day(-32),
              },
              {
                id: 'submission-2',
                link: 'https://example.com/draft-v2',
                revision_notes: 'Perbaiki opening',
                created_at: day(-31),
              },
            ],
          },
          {
            id: 'content-2',
            name: 'Specific - September',
            type: 'specific',
            deadline: day(2),
            status: 'draft_review',
            video_link: null,
            video_submitted_at: null,
            approval_bypassed: false,
            _count: {
              submissions: 0,
            },
            submissions: [],
          },
        ],
      },
    ],
  };
}

describe('CreatorsService', () => {
  let service: CreatorsService;

  const prisma = {
    creators: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        CreatorsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(CreatorsService);
  });

  it('asks the database for one page, ordered by name', async () => {
    prisma.creators.findMany.mockResolvedValue([]);
    prisma.creators.count.mockResolvedValue(0);

    await service.list({ page: 3, pageSize: 10 }, TODAY);

    expect(prisma.creators.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 10,
        orderBy: [{ first_name: 'asc' }, { last_name: 'asc' }, { id: 'asc' }],
      }),
    );
  });

  it('maps a database row to the summary the table renders', async () => {
    prisma.creators.findMany.mockResolvedValue([row()]);
    prisma.creators.count.mockResolvedValue(1);

    const result = await service.list({ page: 1, pageSize: 10 }, TODAY);

    expect(result).toEqual({
      items: [
        {
          id: 'creator-1',
          name: 'Rangga Pratama',
          email: 'rangga@example.com',
          socials: {
            instagram: 'rangga.creates',
            tiktok: 'ranggacreates',
          },
          accessRevokeDate: null,
          contract: {
            status: 'active',
            startDate: '2026-06-10',
            endDate: '2026-12-07',
            daysRemaining: 80,
            periodNumber: 1,
            contentQuota: 6,
            type: 'regular',
          },
          progress: {
            submitted: 2,
            total: 3,
            percent: 67,
          },
          performance: {
            onTimeRate: 50,
            avgRevisions: 0.5,
            productivity: 'watch',
            productivityLabel: 'Perlu Perhatian',
          },
        },
      ],
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
    });
  });

  it('leaves a pending proposal out of progress and performance', async () => {
    const withProposal = row();
    withProposal.contracts[0].contents.push({
      // Past its deadline with nothing handed in: counted, it would drag every number down.
      deadline: day(-5),
      video_submitted_at: null,
      status: 'pending',
      _count: { submissions: 0 },
    });
    prisma.creators.findMany.mockResolvedValue([withProposal]);
    prisma.creators.count.mockResolvedValue(1);

    const result = await service.list({ page: 1, pageSize: 10 }, TODAY);

    expect(result.items[0].progress).toEqual({
      submitted: 2,
      total: 3,
      percent: 67,
    });
    expect(result.items[0].performance).toMatchObject({
      onTimeRate: 50,
      avgRevisions: 0.5,
    });
  });

  it('reads each content status, which is what marks a proposal', async () => {
    prisma.creators.findMany.mockResolvedValue([]);
    prisma.creators.count.mockResolvedValue(0);

    await service.list({ page: 1, pageSize: 10 }, TODAY);

    const { select } = prisma.creators.findMany.mock.calls[0][0];
    expect(select.contracts.select.contents.select).toEqual({
      deadline: true,
      video_submitted_at: true,
      status: true,
      _count: { select: { submissions: true } },
    });
  });

  it('leaves a pending proposal out of a contract period’s totals in the detail', async () => {
    const detail = detailRow();
    detail.contracts[0].contents.push({
      id: 'content-proposal',
      name: 'Ide konten dari kreator',
      type: 'specific',
      deadline: day(10),
      status: 'pending',
      video_link: null,
      video_submitted_at: null,
      approval_bypassed: false,
      _count: { submissions: 0 },
      submissions: [],
    });
    prisma.creators.findUnique.mockResolvedValue(detail);

    const result = await service.findOne('creator-1', TODAY);

    expect(result.contractHistory[0]).toMatchObject({ completed: 1, total: 2 });
  });

  it('tags each content in the detail as late, overdue or approval bypassed', async () => {
    const detail = detailRow();
    detail.contracts[0].contents.push(
      {
        id: 'content-late-bypassed',
        name: 'Link telat tanpa approval',
        type: 'evergreen',
        deadline: day(-10),
        status: 'link_submitted',
        video_link: 'https://example.com/video-late',
        video_submitted_at: day(-8),
        approval_bypassed: true,
        _count: { submissions: 0 },
        submissions: [],
      },
      {
        id: 'content-overdue',
        name: 'Draft telat, belum ada link',
        type: 'evergreen',
        deadline: day(-5),
        status: 'draft_revision',
        video_link: null,
        video_submitted_at: null,
        approval_bypassed: false,
        _count: { submissions: 2 },
        submissions: [
          { id: 'submission-early', link: 'https://example.com/d1', revision_notes: null, created_at: day(-6) },
          { id: 'submission-late', link: 'https://example.com/d2', revision_notes: 'Ulang', created_at: day(-3) },
        ],
      },
    );
    prisma.creators.findUnique.mockResolvedValue(detail);

    const result = await service.findOne('creator-1', TODAY);

    expect(
      Object.fromEntries(result.contents.map((content) => [content.id, content.tags])),
    ).toEqual({
      'content-1': [],
      'content-2': [],
      'content-late-bypassed': ['late_submission', 'approval_bypassed'],
      'content-overdue': ['late_submission', 'overdue'],
    });
  });

  it('reads the bypass flag and every draft hand-in time with the detail, in the same query', async () => {
    prisma.creators.findUnique.mockResolvedValue(detailRow());

    await service.findOne('creator-1', TODAY);

    expect(prisma.creators.findUnique).toHaveBeenCalledTimes(1);
    const contents =
      prisma.creators.findUnique.mock.calls[0][0].select.contracts.select.contents;
    expect(contents.select).toMatchObject({
      approval_bypassed: true,
      video_submitted_at: true,
      submissions: {
        orderBy: { created_at: 'asc' },
        select: expect.objectContaining({ created_at: true }),
      },
    });
  });

  it('joins the middle name into the display name', async () => {
    prisma.creators.findMany.mockResolvedValue([
      row({
        middle_name: 'Nur',
        last_name: 'Aini',
      }),
    ]);
    prisma.creators.count.mockResolvedValue(1);

    const { items } = await service.list({ page: 1, pageSize: 10 }, TODAY);

    expect(items[0].name).toBe('Rangga Nur Aini');
  });

  it('copes with a creator who only has a first name', async () => {
    prisma.creators.findMany.mockResolvedValue([
      row({
        last_name: null,
      }),
    ]);
    prisma.creators.count.mockResolvedValue(1);

    const { items } = await service.list({ page: 1, pageSize: 10 }, TODAY);

    expect(items[0].name).toBe('Rangga');
  });

  it('describes a creator without any contract', async () => {
    prisma.creators.findMany.mockResolvedValue([
      row({
        contracts: [],
        social_accounts: [],
      }),
    ]);
    prisma.creators.count.mockResolvedValue(1);

    const { items } = await service.list({ page: 1, pageSize: 10 }, TODAY);

    expect(items[0]).toMatchObject({
      socials: {},
      contract: {
        status: 'none',
        startDate: null,
        endDate: null,
        daysRemaining: null,
        periodNumber: 0,
        contentQuota: 0,
        type: null,
      },
      progress: {
        submitted: 0,
        total: 0,
        percent: 0,
      },
      performance: {
        onTimeRate: null,
        productivityLabel: 'Belum Ada Data',
      },
    });
  });

  it("numbers the period from the creator's contract history", async () => {
    prisma.creators.findMany.mockResolvedValue([
      row({
        access_revoke_date: day(-14),
        contracts: [
          {
            id: 'second',
            start_date: day(-30),
            end_date: day(150),
            content_quota: 4,
            contract_type: 'probation',
            contents: [],
          },
          {
            id: 'first',
            start_date: day(-400),
            end_date: day(-40),
            content_quota: 6,
            contract_type: 'regular',
            contents: [],
          },
        ],
      }),
    ]);
    prisma.creators.count.mockResolvedValue(1);

    const { items } = await service.list({ page: 1, pageSize: 10 }, TODAY);

    expect(items[0].accessRevokeDate).toBe('2026-09-04');
    expect(items[0].contract).toMatchObject({
      status: 'active',
      periodNumber: 2,
      contentQuota: 4,
      // The current period's type, not the first contract's.
      type: 'probation',
    });
  });

  it('reports the page count from the total, not from the rows returned', async () => {
    prisma.creators.findMany.mockResolvedValue([]);
    prisma.creators.count.mockResolvedValue(23);

    const result = await service.list({ page: 5, pageSize: 10 }, TODAY);

    expect(result).toMatchObject({
      items: [],
      page: 5,
      total: 23,
      totalPages: 3,
    });
  });

  it('has at least one page even when the roster is empty', async () => {
    prisma.creators.findMany.mockResolvedValue([]);
    prisma.creators.count.mockResolvedValue(0);

    const result = await service.list({ page: 1, pageSize: 10 }, TODAY);

    expect(result.totalPages).toBe(1);
  });

  it('searches the whole roster by name or email when q is given', async () => {
    prisma.creators.findMany.mockResolvedValue([
      row({ id: 'creator-1', first_name: 'Nadia', last_name: 'Putri', users: { email: 'nadia@example.com' } }),
      row({ id: 'creator-2', first_name: 'Budi', last_name: 'Santoso', users: { email: 'budi@example.com' } }),
    ]);
    prisma.creators.count.mockResolvedValue(2);

    const result = await service.list({ page: 1, pageSize: 10 }, TODAY, { q: 'nadia' });

    expect(result.items.map((item) => item.id)).toEqual(['creator-1']);
    expect(result.total).toBe(1);
  });

  it('filters the roster by contract status', async () => {
    prisma.creators.findMany.mockResolvedValue([
      row({ id: 'creator-1' }),
      row({
        id: 'creator-2',
        contracts: [{ id: 'c2', start_date: day(-400), end_date: day(-40), content_quota: 4, contract_type: 'regular', contents: [] }],
      }),
    ]);
    prisma.creators.count.mockResolvedValue(2);

    const result = await service.list({ page: 1, pageSize: 10 }, TODAY, { contractStatus: 'expired' });

    expect(result.items.map((item) => item.id)).toEqual(['creator-2']);
    expect(result.total).toBe(1);
  });

  it('filters the roster by productivity band', async () => {
    prisma.creators.findMany.mockResolvedValue([
      row({ id: 'creator-1' }),
      row({
        id: 'creator-2',
        contracts: [
          {
            id: 'c2',
            start_date: day(-100),
            end_date: day(80),
            content_quota: 1,
            contract_type: 'regular',
            contents: [{ deadline: day(-30), video_submitted_at: null, status: 'scheduled', _count: { submissions: 0 } }],
          },
        ],
      }),
    ]);
    prisma.creators.count.mockResolvedValue(2);

    const result = await service.list({ page: 1, pageSize: 10 }, TODAY, { productivity: 'risk' });

    expect(result.items.map((item) => item.id)).toEqual(['creator-2']);
    expect(result.total).toBe(1);
  });

  // A creator with nothing to judge yet is its own band, not a watch-listed one.
  it('filters the roster to creators without data yet', async () => {
    prisma.creators.findMany.mockResolvedValue([
      row({ id: 'creator-1' }),
      row({ id: 'creator-2', contracts: [] }),
    ]);
    prisma.creators.count.mockResolvedValue(2);

    const result = await service.list({ page: 1, pageSize: 10 }, TODAY, { productivity: 'no_data' });

    expect(result.items.map((item) => item.id)).toEqual(['creator-2']);
  });

  it('combines q, contractStatus and productivity with AND, not OR', async () => {
    prisma.creators.findMany.mockResolvedValue([
      // Matches the search and the contract status, but not the productivity band.
      row({ id: 'creator-1', first_name: 'Nadia' }),
      // Matches nothing: wrong name entirely.
      row({ id: 'creator-2', first_name: 'Budi', last_name: 'Santoso', users: { email: 'budi@example.com' } }),
    ]);
    prisma.creators.count.mockResolvedValue(2);

    const result = await service.list(
      { page: 1, pageSize: 10 },
      TODAY,
      { q: 'nadia', contractStatus: 'active', productivity: 'risk' },
    );

    expect(result.items).toEqual([]);
  });

  it('does not ask the database to skip/take when a filter is active', async () => {
    prisma.creators.findMany.mockResolvedValue([]);
    prisma.creators.count.mockResolvedValue(0);

    await service.list({ page: 2, pageSize: 10 }, TODAY, { q: 'anything' });

    expect(prisma.creators.findMany).toHaveBeenCalledWith({
      select: expect.anything(),
      orderBy: expect.anything(),
    });
    expect(prisma.creators.count).not.toHaveBeenCalled();
  });

  it('uses the current date when none is given', async () => {
    prisma.creators.findMany.mockResolvedValue([
      row({
        contracts: [
          {
            id: 'c',
            start_date: day(-1),
            end_date: new Date('2999-01-01T00:00:00Z'),
            content_quota: 1,
            contract_type: 'regular',
            contents: [],
          },
        ],
      }),
    ]);
    prisma.creators.count.mockResolvedValue(1);

    const { items } = await service.list({
      page: 1,
      pageSize: 10,
    });

    expect(items[0].contract.status).toBe('active');
  });

  it('exposes a creator detail operation', () => {
    const findOne = (
      service as unknown as {
        findOne?: (id: string, today?: Date) => Promise<unknown>;
      }
    ).findOne;

    expect(findOne).toBeTypeOf('function');
  });

  it('returns full creator details and rejects a missing creator', async () => {
    const findOne = (
      service as unknown as {
        findOne?: (
          id: string,
          today?: Date,
        ) => Promise<{
          phoneNumber: string | null;
          contractHistory: unknown[];
          contents: unknown[];
          drafts: unknown[];
        }>;
      }
    ).findOne;

    expect(findOne).toBeTypeOf('function');

    if (typeof findOne !== 'function') {
      return;
    }

    prisma.creators.findUnique.mockResolvedValue(detailRow());

    const result = await findOne.call(service, 'creator-1', TODAY);

    expect(result).toMatchObject({
      phoneNumber: '081234567001',
      contractHistory: [
        expect.objectContaining({
          id: 'contract-1',
          periodNumber: 1,
          contentQuota: 6,
          type: 'regular',
          completed: 1,
          total: 2,
          isCurrent: true,
        }),
      ],
      contents: [
        expect.objectContaining({
          id: 'content-1',
          name: 'Evergreen - Tips Belajar Cepat',
          outcome: 'on_time',
          videoLink: 'https://example.com/video-1',
        }),
        expect.objectContaining({
          id: 'content-2',
          name: 'Specific - September',
          outcome: 'open',
          videoLink: null,
        }),
      ],
      drafts: [
        expect.objectContaining({
          contentId: 'content-1',
          revisionCount: 1,
          latestLink: 'https://example.com/draft-v2',
        }),
      ],
    });

    prisma.creators.findUnique.mockResolvedValue(null);

    await expect(
      findOne.call(service, 'missing-creator', TODAY),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
