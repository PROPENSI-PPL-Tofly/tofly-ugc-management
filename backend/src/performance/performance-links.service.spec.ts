import {
  PerformanceLinksService,
  type PerformanceLinkRow,
  type PerformanceLinksClient,
} from './performance-links.service.js';

const RANGGA = '0b5e2c9a-6f3d-4e1b-8a7c-9d2f4e6a8b1c';
const SYNCED_AT = new Date('2026-11-03T19:00:00.000Z');

function linkRow(
  overrides: Partial<PerformanceLinkRow> = {},
): PerformanceLinkRow {
  return {
    id: 'link-1',
    platform: 'tiktok',
    url: 'https://www.tiktok.com/@rangga/video/1',
    views: 45200,
    likes: 0,
    comments: null,
    shares: 340,
    data_state: 'synced',
    last_synced_at: SYNCED_AT,
    manual_at: null,
    contents: {
      id: 'content-1',
      name: 'Promo akhir bulan',
      contracts: {
        creators: {
          id: RANGGA,
          first_name: 'Rangga',
          middle_name: null,
          last_name: 'Pratama',
          social_accounts: [
            {
              platform: 'tiktok',
              is_connected: true,
              platform_user_id: '7012',
            },
          ],
        },
      },
    },
    ...overrides,
  };
}

/** findMany and count are stubs; $transaction runs the batch as Prisma does. */
function prismaWith(rows: PerformanceLinkRow[], total: number) {
  const prisma = {
    content_links: {
      findMany: vi.fn().mockReturnValue(Promise.resolve(rows)),
      count: vi.fn().mockReturnValue(Promise.resolve(total)),
    },
    $transaction: vi.fn((batch: Promise<unknown>[]) => Promise.all(batch)),
  };
  return {
    prisma,
    service: new PerformanceLinksService(
      prisma as unknown as PerformanceLinksClient,
    ),
  };
}

describe('PerformanceLinksService.list', () => {
  it('reads one page of submitted links, filtered and newest first, in one query and one count (AC 22-23, 26)', async () => {
    const { prisma, service } = prismaWith([linkRow()], 11);

    await service.list(
      { page: 2, pageSize: 10 },
      { creators: [RANGGA], platforms: ['tiktok'] },
    );

    const where = {
      platform: { in: ['tiktok'] },
      contents: {
        status: 'link_submitted',
        contracts: { creator_id: { in: [RANGGA] } },
      },
    };
    expect(prisma.content_links.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.content_links.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        // Newest hand-in first; the creation time and the id settle ties, so a page is stable.
        orderBy: [
          { submitted_at: 'desc' },
          { created_at: 'desc' },
          { id: 'desc' },
        ],
        skip: 10,
        take: 10,
      }),
    );
    expect(prisma.content_links.count).toHaveBeenCalledWith({ where });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('lists every link that has a platform when no filter is named', async () => {
    const { prisma, service } = prismaWith([], 0);

    await service.list(
      { page: 1, pageSize: 10 },
      { creators: undefined, platforms: undefined },
    );

    expect(prisma.content_links.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          platform: { not: null },
          contents: { status: 'link_submitted' },
        },
        skip: 0,
      }),
    );
  });

  it("answers each link with its content, creator and performance, and the page's envelope", async () => {
    const { service } = prismaWith([linkRow()], 11);

    const page = await service.list(
      { page: 2, pageSize: 10 },
      { creators: undefined, platforms: undefined },
    );

    expect(page).toEqual({
      items: [
        {
          linkId: 'link-1',
          contentId: 'content-1',
          contentName: 'Promo akhir bulan',
          creatorId: RANGGA,
          creatorName: 'Rangga Pratama',
          platform: 'tiktok',
          url: 'https://www.tiktok.com/@rangga/video/1',
          views: 45200,
          likes: 0,
          comments: null,
          shares: 340,
          state: 'synced',
          lastSyncedAt: SYNCED_AT.toISOString(),
          manualAt: null,
        },
      ],
      page: 2,
      pageSize: 10,
      total: 11,
      totalPages: 2,
    });
  });

  it("judges a waiting link by its creator's account on that link's platform", async () => {
    const { service } = prismaWith(
      [
        linkRow({
          platform: 'instagram',
          data_state: 'waiting',
          last_synced_at: null,
        }),
      ],
      1,
    );

    const page = await service.list(
      { page: 1, pageSize: 10 },
      { creators: undefined, platforms: undefined },
    );

    // The creator connected TikTok only, so the Instagram link reads not_connected.
    expect(page.items[0].state).toBe('not_connected');
  });

  it('answers an empty list with no pages', async () => {
    const { service } = prismaWith([], 0);

    expect(
      await service.list(
        { page: 1, pageSize: 10 },
        { creators: undefined, platforms: undefined },
      ),
    ).toEqual({ items: [], page: 1, pageSize: 10, total: 0, totalPages: 0 });
  });
});
