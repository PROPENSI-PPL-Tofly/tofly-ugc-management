import { HttpException } from '@nestjs/common';
import {
  ManualPerformanceService,
  MANUAL_LINK_SELECT,
  type ManualLinkRow,
  type ManualPerformanceClient,
} from './manual-performance.service.js';

const CONTENT_ID = '7d0c5f1e-3b1a-4c2e-9f4d-2a6b8c0d1e2f';
const LINK_ID = '3c2b1a09-8f7e-4d6c-9b5a-4e3d2c1b0a9f';
const ADMIN_USER = '9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f';
const REEL = 'https://www.instagram.com/reel/C9xYz/';

// 2 Nov 2026, 10.00 WIB.
const NOW = new Date('2026-11-02T03:00:00.000Z');

const TYPED = { views: 12400, likes: 830, comments: null, shares: 7 };

function row(overrides: Partial<ManualLinkRow> = {}): ManualLinkRow {
  return {
    id: LINK_ID,
    platform: 'instagram',
    url: REEL,
    views: null,
    likes: null,
    comments: null,
    shares: null,
    data_state: 'waiting',
    contents: {
      contracts: {
        invoice: { status: 'running' },
        creators: { social_accounts: [] },
      },
    },
    ...overrides,
  };
}

function connected(): ManualLinkRow['contents'] {
  return {
    contracts: {
      invoice: { status: 'running' },
      creators: {
        social_accounts: [
          {
            platform: 'instagram',
            is_connected: true,
            platform_user_id: '17841400000000000',
          },
        ],
      },
    },
  };
}

async function refusal(
  work: Promise<unknown>,
): Promise<{ status: number; body: unknown }> {
  const error = await work.then(
    () => {
      throw new Error('expected a refusal');
    },
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(HttpException);
  return {
    status: (error as HttpException).getStatus(),
    body: (error as HttpException).getResponse(),
  };
}

describe('ManualPerformanceService', () => {
  const transaction = {
    $queryRaw: vi.fn(),
    content_links: { findFirst: vi.fn(), updateMany: vi.fn() },
    content_events: { create: vi.fn() },
  };
  const prisma = {
    $transaction: vi.fn((work: (tx: typeof transaction) => unknown) =>
      work(transaction),
    ),
  } as unknown as ManualPerformanceClient;
  const service = new ManualPerformanceService(prisma);

  beforeEach(() => {
    vi.clearAllMocks();
    transaction.content_links.findFirst.mockResolvedValue(row());
    transaction.content_links.updateMany.mockResolvedValue({ count: 1 });
  });

  it("locks the content's contract row before it reads the invoice, so it queues behind Finalize (AC 18)", async () => {
    await service.save(CONTENT_ID, 'instagram', TYPED, ADMIN_USER, NOW);

    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    const [lock] = transaction.$queryRaw.mock.calls[0] as [
      { sql: string; values: unknown[] },
    ];
    expect(lock.sql).toMatch(/FOR UPDATE OF contracts$/);
    expect(lock.values).toEqual([CONTENT_ID]);
    expect(transaction.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.content_links.findFirst.mock.invocationCallOrder[0],
    );
  });

  it("reads the content's link on that platform, with only the columns the rule needs", async () => {
    await service.save(CONTENT_ID, 'instagram', TYPED, ADMIN_USER, NOW);

    expect(transaction.content_links.findFirst).toHaveBeenCalledWith({
      where: { content_id: CONTENT_ID, platform: 'instagram' },
      select: MANUAL_LINK_SELECT,
    });
  });

  it("reads whether the creator's accounts are connected without any token column", () => {
    expect(
      MANUAL_LINK_SELECT.contents.select.contracts.select.creators.select
        .social_accounts,
    ).toEqual({
      select: { platform: true, is_connected: true, platform_user_id: true },
    });
  });

  it("does not count the creator's account on another platform", async () => {
    transaction.content_links.findFirst.mockResolvedValue(
      row({
        contents: {
          contracts: {
            invoice: { status: 'running' },
            creators: {
              social_accounts: [
                {
                  platform: 'tiktok',
                  is_connected: true,
                  platform_user_id: '7000',
                },
              ],
            },
          },
        },
      }),
    );

    await expect(
      service.save(CONTENT_ID, 'instagram', TYPED, ADMIN_USER, NOW),
    ).resolves.toMatchObject({ state: 'manual' });
  });

  it('saves the typed numbers as Diisi manual, naming the admin and the time (AC 3, 16)', async () => {
    const saved = await service.save(
      CONTENT_ID,
      'instagram',
      TYPED,
      ADMIN_USER,
      NOW,
    );

    expect(transaction.content_links.updateMany).toHaveBeenCalledWith({
      where: { id: LINK_ID, data_state: 'waiting' },
      data: {
        ...TYPED,
        data_state: 'manual',
        manual_by: ADMIN_USER,
        manual_at: NOW,
      },
    });
    expect(saved).toEqual({
      platform: 'instagram',
      url: REEL,
      ...TYPED,
      state: 'manual',
      lastSyncedAt: null,
      manualAt: NOW.toISOString(),
    });
  });

  it('records the old and new numbers, who and when, in the timeline (AC 16)', async () => {
    transaction.content_links.findFirst.mockResolvedValue(
      row({ data_state: 'sync_failed', views: 9000, likes: 500 }),
    );

    await service.save(CONTENT_ID, 'instagram', TYPED, ADMIN_USER, NOW);

    expect(transaction.content_events.create).toHaveBeenCalledWith({
      data: {
        content_id: CONTENT_ID,
        event_type: 'Performance Entered',
        actor_name: 'Admin',
        actor_role: 'admin',
        actor_user_id: ADMIN_USER,
        occurred_at: NOW,
        event_data: {
          platform: 'instagram',
          before: {
            views: 9000,
            likes: 500,
            comments: null,
            shares: null,
            state: 'sync_failed',
          },
          after: { ...TYPED, state: 'manual' },
        },
      },
    });
  });

  it.each([
    ['not found', 'not_found'],
    ['sync failed', 'sync_failed'],
    ['already filled by hand', 'manual'],
  ] as const)(
    'accepts a link whose platform could not give numbers: %s',
    async (_label, state) => {
      transaction.content_links.findFirst.mockResolvedValue(
        row({ data_state: state, contents: connected() }),
      );

      await expect(
        service.save(CONTENT_ID, 'instagram', TYPED, ADMIN_USER, NOW),
      ).resolves.toMatchObject({ state: 'manual' });
    },
  );

  it('accepts a waiting link whose creator never connected the account (AC 14)', async () => {
    await expect(
      service.save(CONTENT_ID, 'instagram', TYPED, ADMIN_USER, NOW),
    ).resolves.toMatchObject({ state: 'manual' });
  });

  it.each([
    ['waiting for a sync of a connected account', 'waiting'],
    ['synced and working', 'synced'],
  ] as const)(
    'refuses a link %s with 409, writing nothing (AC 14)',
    async (_label, state) => {
      transaction.content_links.findFirst.mockResolvedValue(
        row({ data_state: state, contents: connected() }),
      );

      expect(
        await refusal(
          service.save(CONTENT_ID, 'instagram', TYPED, ADMIN_USER, NOW),
        ),
      ).toEqual({
        status: 409,
        body: {
          code: 'MANUAL_NOT_ALLOWED',
          message:
            'Angka hanya bisa diisi manual saat akun belum terhubung, link tidak ditemukan, atau gagal sinkron',
        },
      });
      expect(transaction.content_links.updateMany).not.toHaveBeenCalled();
      expect(transaction.content_events.create).not.toHaveBeenCalled();
    },
  );

  it('counts an account flagged connected with no platform account behind it as not connected', async () => {
    transaction.content_links.findFirst.mockResolvedValue(
      row({
        contents: {
          contracts: {
            invoice: null,
            creators: {
              social_accounts: [
                {
                  platform: 'instagram',
                  is_connected: true,
                  platform_user_id: null,
                },
              ],
            },
          },
        },
      }),
    );

    await expect(
      service.save(CONTENT_ID, 'instagram', TYPED, ADMIN_USER, NOW),
    ).resolves.toMatchObject({ state: 'manual' });
  });

  it.each(['finalized', 'creator_acked', 'payment_uploaded', 'paid'] as const)(
    'refuses once the invoice is %s, with the message of AC 18',
    async (status) => {
      transaction.content_links.findFirst.mockResolvedValue(
        row({
          data_state: 'not_found',
          contents: {
            contracts: {
              invoice: { status },
              creators: { social_accounts: [] },
            },
          },
        }),
      );

      expect(
        await refusal(
          service.save(CONTENT_ID, 'instagram', TYPED, ADMIN_USER, NOW),
        ),
      ).toEqual({
        status: 409,
        body: {
          code: 'INVOICE_FINALIZED',
          message: 'Invoice sudah difinalisasi. Koreksi lewat penyesuaian.',
        },
      });
      expect(transaction.content_links.updateMany).not.toHaveBeenCalled();
    },
  );

  it('answers 404 for a content with no link on that platform', async () => {
    transaction.content_links.findFirst.mockResolvedValue(null);

    expect(
      await refusal(service.save(CONTENT_ID, 'tiktok', TYPED, ADMIN_USER, NOW)),
    ).toEqual({
      status: 404,
      body: { code: 'LINK_NOT_FOUND', message: 'Link tidak ditemukan' },
    });
  });

  it('answers 409 when the link changed state between the read and the write, writing no event', async () => {
    transaction.content_links.updateMany.mockResolvedValue({ count: 0 });

    expect(
      await refusal(
        service.save(CONTENT_ID, 'instagram', TYPED, ADMIN_USER, NOW),
      ),
    ).toEqual({
      status: 409,
      body: {
        code: 'LINK_CHANGED',
        message: 'Data link ini baru saja berubah. Muat ulang lalu coba lagi',
      },
    });
    expect(transaction.content_events.create).not.toHaveBeenCalled();
  });
});
