import { PERFORMANCE_LINK_SELECT } from './performance-links.js';
import {
  PerformanceLinksService,
  type PerformanceLinksClient,
} from './performance-links.service.js';

const CREATOR_A = '0f9c2f5e-6b1a-4f3e-9a51-3c1d2e4b5a60';

const ROW = {
  id: 'link-1',
  platform: 'tiktok' as const,
  url: 'https://www.tiktok.com/@rani/video/7312345678901234567',
  views: null,
  likes: null,
  comments: null,
  shares: null,
  data_state: 'waiting' as const,
  last_synced_at: null,
  manual_at: null,
  contents: {
    id: 'content-1',
    name: 'Review Kopi',
    contracts: {
      creators: {
        id: CREATOR_A,
        first_name: 'Rani',
        middle_name: null,
        last_name: null,
        social_accounts: [],
      },
    },
  },
};

describe('PerformanceLinksService', () => {
  const content_links = { count: vi.fn(), findMany: vi.fn() };
  const service = new PerformanceLinksService({
    content_links,
  } as unknown as PerformanceLinksClient);

  beforeEach(() => {
    vi.clearAllMocks();
    content_links.count.mockResolvedValue(23);
    content_links.findMany.mockResolvedValue([ROW]);
  });

  it('lists only links with a platform to measure, newest first, one page at a time', async () => {
    await service.list({ page: 3, pageSize: 10 }, {});

    const where = { platform: { not: null } };
    expect(content_links.count).toHaveBeenCalledWith({ where });
    expect(content_links.findMany).toHaveBeenCalledWith({
      where,
      select: PERFORMANCE_LINK_SELECT,
      orderBy: [
        { submitted_at: 'desc' },
        { created_at: 'desc' },
        { id: 'asc' },
      ],
      skip: 20,
      take: 10,
    });
  });

  it('narrows to the chosen creators and platforms', async () => {
    await service.list(
      { page: 1, pageSize: 10 },
      { creators: [CREATOR_A], platforms: ['tiktok'] },
    );

    expect(content_links.count).toHaveBeenCalledWith({
      where: {
        platform: { in: ['tiktok'] },
        contents: { contracts: { creator_id: { in: [CREATOR_A] } } },
      },
    });
  });

  // I3.2 (SCRUM-279): each word must be in the content's name or in any part of the creator's,
  // so "rani kopi" finds Rani's "Review Kopi", and the count pages the search, not every link.
  it('searches each word in the content name or any part of the creator name', async () => {
    await service.list({ page: 1, pageSize: 10 }, { q: 'Rani  kopi' });

    const matches = (word: string) => ({
      OR: [
        { contents: { name: { contains: word, mode: 'insensitive' } } },
        ...(['first_name', 'middle_name', 'last_name'] as const).map(
          (part) => ({
            contents: {
              contracts: {
                creators: { [part]: { contains: word, mode: 'insensitive' } },
              },
            },
          }),
        ),
      ],
    });
    const where = {
      platform: { not: null },
      AND: [matches('Rani'), matches('kopi')],
    };
    expect(content_links.count).toHaveBeenCalledWith({ where });
    expect(content_links.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where }),
    );
  });

  it('searches alongside the creator and platform filters', async () => {
    await service.list(
      { page: 1, pageSize: 10 },
      { creators: [CREATOR_A], platforms: ['tiktok'], q: 'kopi' },
    );

    expect(content_links.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        platform: { in: ['tiktok'] },
        contents: { contracts: { creator_id: { in: [CREATOR_A] } } },
        AND: [expect.objectContaining({ OR: expect.any(Array) })],
      }),
    });
  });

  it('narrows to the chosen data states beside the other filters, without clashing with them', async () => {
    await service.list(
      { page: 1, pageSize: 10 },
      { creators: [CREATOR_A], states: ['manual'] },
    );

    expect(content_links.count).toHaveBeenCalledWith({
      where: {
        platform: { not: null },
        contents: { contracts: { creator_id: { in: [CREATOR_A] } } },
        AND: [{ OR: [{ data_state: 'manual' }] }],
      },
    });
  });

  // Both narrow through one AND: two spread `AND` keys would let the last one drop the other.
  it('keeps the search when a data state is chosen too', async () => {
    await service.list(
      { page: 1, pageSize: 10 },
      { q: 'kopi', states: ['manual'] },
    );

    expect(content_links.count).toHaveBeenCalledWith({
      where: {
        platform: { not: null },
        AND: [
          expect.objectContaining({ OR: expect.any(Array) }),
          { OR: [{ data_state: 'manual' }] },
        ],
      },
    });
  });

  it('answers the page with its total and page count', async () => {
    const page = await service.list({ page: 1, pageSize: 10 }, {});

    expect(page).toMatchObject({
      page: 1,
      pageSize: 10,
      total: 23,
      totalPages: 3,
    });
    expect(page.items).toEqual([
      expect.objectContaining({
        linkId: 'link-1',
        creatorName: 'Rani',
        state: 'not_connected',
      }),
    ]);
  });

  it('still answers one page when nothing is listed', async () => {
    content_links.count.mockResolvedValue(0);
    content_links.findMany.mockResolvedValue([]);

    expect(await service.list({ page: 1, pageSize: 10 }, {})).toEqual({
      items: [],
      page: 1,
      pageSize: 10,
      total: 0,
      totalPages: 1,
    });
  });
});
