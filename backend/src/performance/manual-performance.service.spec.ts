import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  ManualPerformanceService,
  type ManualContentRow,
  type ManualPerformanceClient,
  type ManualPerformanceTransaction,
} from './manual-performance.service.js';

const NOW = new Date('2026-11-04T03:15:00.000Z');
const ADMIN = '11111111-1111-4111-8111-111111111111';
const CONTENT = '22222222-2222-4222-8222-222222222222';
const ENTERED = { views: 12400, likes: null, comments: 0, shares: null };

/** The content as one read finds it: a TikTok link that failed to sync, invoice running. */
function row(overrides: Partial<ManualContentRow> = {}): ManualContentRow {
  return {
    id: CONTENT,
    contract_id: 'contract-1',
    contracts: {
      invoice: null,
      creators: { social_accounts: [] },
    },
    content_links: [
      {
        id: 'link-1',
        platform: 'tiktok',
        url: 'https://www.tiktok.com/@nabila/video/7412345678901234567',
        data_state: 'sync_failed',
        views: 9000,
        likes: null,
        comments: null,
        shares: null,
        last_synced_at: null,
      },
    ],
    ...overrides,
  };
}

/** A transaction stub: findFirst is a stub, the writes are spies whose calls are checked. */
function transaction(found: ManualContentRow | null, updated = 1) {
  return {
    contents: { findFirst: vi.fn().mockResolvedValue(found) },
    content_links: {
      updateMany: vi.fn().mockResolvedValue({ count: updated }),
    },
    content_events: { create: vi.fn().mockResolvedValue({}) },
  } satisfies ManualPerformanceTransaction;
}

function serviceWith(tx: ManualPerformanceTransaction) {
  const prisma: ManualPerformanceClient = {
    $transaction: (work) => work(tx),
  };
  vi.spyOn(prisma, '$transaction');
  return { service: new ManualPerformanceService(prisma), prisma };
}

describe('ManualPerformanceService.enter', () => {
  it('reads the content with its link on that platform, then writes the numbers and their event, and answers the card', async () => {
    const tx = transaction(row());
    const { service, prisma } = serviceWith(tx);

    const answer = await service.enter(CONTENT, 'tiktok', ENTERED, ADMIN, NOW);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.contents.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CONTENT, status: 'link_submitted' },
      }),
    );
    expect(tx.content_links.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'link-1',
        data_state: 'sync_failed',
        url: 'https://www.tiktok.com/@nabila/video/7412345678901234567',
      },
      data: {
        ...ENTERED,
        data_state: 'manual',
        manual_by: ADMIN,
        manual_at: NOW,
      },
    });
    expect(tx.content_events.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        content_id: CONTENT,
        event_type: 'Performance Entered',
        actor_user_id: ADMIN,
      }),
    });
    expect(
      tx.content_links.updateMany.mock.invocationCallOrder[0],
    ).toBeLessThan(tx.content_events.create.mock.invocationCallOrder[0]);
    expect(answer).toEqual({
      ...ENTERED,
      state: 'manual',
      lastSyncedAt: null,
      manualAt: NOW.toISOString(),
    });
  });

  it('reads the platform account and the invoice the plan judges by', async () => {
    const tx = transaction(
      row({
        contracts: {
          invoice: { status: 'finalized' },
          creators: {
            social_accounts: [
              {
                platform: 'tiktok',
                is_connected: true,
                platform_user_id: '7012',
              },
            ],
          },
        },
      }),
    );

    await expect(
      serviceWith(tx).service.enter(CONTENT, 'tiktok', ENTERED, ADMIN, NOW),
    ).rejects.toMatchObject({
      response: { code: 'INVOICE_FINALIZED' },
    });
    expect(tx.content_links.updateMany).not.toHaveBeenCalled();
    expect(tx.content_events.create).not.toHaveBeenCalled();
  });

  it('answers 404 CONTENT_NOT_FOUND for a content that does not exist or has no links yet, writing nothing', async () => {
    const tx = transaction(null);

    const refused = serviceWith(tx).service.enter(
      CONTENT,
      'tiktok',
      ENTERED,
      ADMIN,
      NOW,
    );

    await expect(refused).rejects.toBeInstanceOf(NotFoundException);
    await expect(refused).rejects.toMatchObject({
      response: { code: 'CONTENT_NOT_FOUND' },
    });
    expect(tx.content_links.updateMany).not.toHaveBeenCalled();
    expect(tx.content_events.create).not.toHaveBeenCalled();
  });

  it('answers 409 PERFORMANCE_CHANGED and records no event when the link moved between the read and the write', async () => {
    const tx = transaction(row(), 0);

    const refused = serviceWith(tx).service.enter(
      CONTENT,
      'tiktok',
      ENTERED,
      ADMIN,
      NOW,
    );

    await expect(refused).rejects.toBeInstanceOf(ConflictException);
    await expect(refused).rejects.toMatchObject({
      response: {
        code: 'PERFORMANCE_CHANGED',
        message: 'Data link ini baru saja berubah. Muat ulang lalu coba lagi',
      },
    });
    expect(tx.content_events.create).not.toHaveBeenCalled();
  });

  it('lets a failed event write fail the whole entry, so the transaction rolls the numbers back', async () => {
    const tx = transaction(row());
    tx.content_events.create.mockRejectedValue(new Error('insert failed'));

    await expect(
      serviceWith(tx).service.enter(CONTENT, 'tiktok', ENTERED, ADMIN, NOW),
    ).rejects.toThrow('insert failed');
  });
});
