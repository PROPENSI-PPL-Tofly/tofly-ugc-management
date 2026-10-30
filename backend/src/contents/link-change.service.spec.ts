import { HttpException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AdminLinkActor,
  CreatorLinkActor,
  type LinkedContent,
} from './link-change.js';
import {
  LINKED_CONTENT_SELECT,
  LinkChangeService,
  type LinkChangeClient,
  type LinkChangeTransaction,
} from './link-change.service.js';

const CONTENT_ID = '7d0c5f1e-3b1a-4c2e-9f4d-2a6b8c0d1e2f';
const CREATOR_ID = '0b5e2c9a-6f3d-4e1b-8a7c-9d2f4e6a8b1c';
const CREATOR_USER = '5a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const ADMIN_USER = '9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f';

const REEL = 'https://www.instagram.com/reel/C9xYz/';
const OTHER_REEL = 'https://www.instagram.com/p/D1aBc/';
const VIDEO = 'https://www.tiktok.com/@tofly/video/7312345678901234567';

// 10 Oct 2026, 09.30 WIB.
const NOW = new Date('2026-10-10T02:30:00.000Z');
const TODAY = new Date('2026-10-10T00:00:00.000Z');

function stored(overrides: Partial<LinkedContent> = {}): LinkedContent {
  return {
    id: CONTENT_ID,
    status: 'draft_approved',
    deadline: new Date('2026-10-20T00:00:00.000Z'),
    video_submitted_at: null,
    content_links: [],
    contracts: {
      invoice: null,
      creators: {
        user_id: CREATOR_USER,
        first_name: 'Rani',
        middle_name: null,
        last_name: 'Putri',
        social_accounts: [{ platform: 'instagram' }, { platform: 'tiktok' }],
      },
    },
    ...overrides,
  };
}

const LINKED = stored({
  status: 'link_submitted',
  video_submitted_at: new Date('2026-10-05T00:00:00.000Z'),
  content_links: [
    {
      id: 'link-ig',
      platform: 'instagram',
      url: REEL,
      submitted_at: new Date('2026-10-05T00:00:00.000Z'),
    },
  ],
});

function uniqueViolation(
  target: string[],
): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });
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

describe('LinkChangeService', () => {
  const transaction = {
    contents: { findFirst: vi.fn(), updateMany: vi.fn() },
    content_links: { createMany: vi.fn(), updateMany: vi.fn() },
    content_events: { createMany: vi.fn() },
  } satisfies Record<keyof LinkChangeTransaction, unknown>;
  const prisma: LinkChangeClient = {
    $transaction: vi.fn((work) =>
      work(transaction as unknown as LinkChangeTransaction),
    ),
  };

  const creator = new CreatorLinkActor(CREATOR_ID);
  const admin = new AdminLinkActor(ADMIN_USER);

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    vi.clearAllMocks();
    transaction.contents.updateMany.mockResolvedValue({ count: 1 });
    transaction.content_links.createMany.mockResolvedValue({ count: 1 });
    transaction.content_links.updateMany.mockResolvedValue({ count: 1 });
    transaction.content_events.createMany.mockResolvedValue({ count: 1 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('submit', () => {
    it('reads the content once, scoped to the creator, and writes status, links and events in one transaction', async () => {
      transaction.contents.findFirst.mockResolvedValue(stored());
      const service = new LinkChangeService(prisma);

      const result = await service.submit(CONTENT_ID, creator, [
        { platform: 'instagram', url: REEL },
        { platform: 'tiktok', url: VIDEO },
      ]);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(transaction.contents.findFirst).toHaveBeenCalledWith({
        where: {
          id: CONTENT_ID,
          status: {
            in: [
              'scheduled',
              'draft_review',
              'draft_revision',
              'draft_approved',
              'link_submitted',
            ],
          },
          contracts: { creator_id: CREATOR_ID },
        },
        select: LINKED_CONTENT_SELECT,
      });
      expect(transaction.contents.updateMany).toHaveBeenCalledWith({
        where: { id: CONTENT_ID, status: 'draft_approved' },
        data: {
          status: 'link_submitted',
          video_submitted_at: TODAY,
          approval_bypassed: false,
        },
      });
      // One statement for every link and one for every event, whatever their number.
      expect(transaction.content_links.createMany).toHaveBeenCalledTimes(1);
      expect(
        transaction.content_links.createMany.mock.calls[0][0].data,
      ).toHaveLength(2);
      expect(transaction.content_events.createMany).toHaveBeenCalledTimes(1);
      expect(
        transaction.content_events.createMany.mock.calls[0][0].data,
      ).toHaveLength(2);
      expect(transaction.content_links.updateMany).not.toHaveBeenCalled();
      expect(result.links).toHaveLength(2);
    });

    it('reads every committed content for an admin, with no creator scope', async () => {
      transaction.contents.findFirst.mockResolvedValue(stored());

      await new LinkChangeService(prisma).submit(CONTENT_ID, admin, [
        { platform: 'tiktok', url: VIDEO },
      ]);

      expect(
        transaction.contents.findFirst.mock.calls[0][0].where,
      ).not.toHaveProperty('contracts');
    });

    it('leaves the status alone for a later platform', async () => {
      transaction.contents.findFirst.mockResolvedValue(LINKED);

      await new LinkChangeService(prisma).submit(CONTENT_ID, creator, [
        { platform: 'tiktok', url: VIDEO },
      ]);

      expect(transaction.contents.updateMany).not.toHaveBeenCalled();
      expect(transaction.content_links.createMany).toHaveBeenCalledTimes(1);
    });

    it('answers 404 for a content out of reach, writing nothing', async () => {
      transaction.contents.findFirst.mockResolvedValue(null);

      expect(
        await refusal(
          new LinkChangeService(prisma).submit(CONTENT_ID, creator, [
            { platform: 'tiktok', url: VIDEO },
          ]),
        ),
      ).toEqual({
        status: 404,
        body: { code: 'CONTENT_NOT_FOUND', message: 'Konten tidak ditemukan' },
      });
      expect(transaction.contents.updateMany).not.toHaveBeenCalled();
      expect(transaction.content_links.createMany).not.toHaveBeenCalled();
    });

    it('answers 409 when another request moved the content first, writing no link', async () => {
      transaction.contents.findFirst.mockResolvedValue(stored());
      transaction.contents.updateMany.mockResolvedValue({ count: 0 });

      expect(
        await refusal(
          new LinkChangeService(prisma).submit(CONTENT_ID, creator, [
            { platform: 'tiktok', url: VIDEO },
          ]),
        ),
      ).toEqual({
        status: 409,
        body: {
          code: 'VIDEO_NOT_ELIGIBLE',
          message:
            'Status konten ini baru saja berubah. Muat ulang lalu coba lagi',
        },
      });
      expect(transaction.content_links.createMany).not.toHaveBeenCalled();
    });

    it('answers a video already on another content with the message the creator sees (AC 5)', async () => {
      transaction.contents.findFirst.mockResolvedValue(stored());
      transaction.content_links.createMany.mockRejectedValue(
        uniqueViolation(['normalized_url']),
      );

      expect(
        await refusal(
          new LinkChangeService(prisma).submit(CONTENT_ID, creator, [
            { platform: 'instagram', url: REEL },
          ]),
        ),
      ).toEqual({
        status: 409,
        body: {
          code: 'VIDEO_LINK_TAKEN',
          message: 'Link ini sudah dipakai di konten lain',
        },
      });
      expect(transaction.content_events.createMany).not.toHaveBeenCalled();
    });

    it('answers a platform linked by a request that won the race as already sent', async () => {
      transaction.contents.findFirst.mockResolvedValue(LINKED);
      transaction.content_links.createMany.mockRejectedValue(
        uniqueViolation(['content_id', 'platform']),
      );

      expect(
        await refusal(
          new LinkChangeService(prisma).submit(CONTENT_ID, creator, [
            { platform: 'tiktok', url: VIDEO },
          ]),
        ),
      ).toEqual({
        status: 409,
        body: {
          code: 'LINK_EXISTS',
          message:
            'Link untuk platform ini baru saja dikirim. Muat ulang lalu coba lagi',
        },
      });
    });

    it('lets any other database failure through untouched', async () => {
      const failure = new Error('connection lost');
      transaction.contents.findFirst.mockResolvedValue(stored());
      transaction.content_links.createMany.mockRejectedValue(failure);

      await expect(
        new LinkChangeService(prisma).submit(CONTENT_ID, creator, [
          { platform: 'tiktok', url: VIDEO },
        ]),
      ).rejects.toBe(failure);
    });
  });

  describe('replace', () => {
    it('swaps the link on the url it read, clearing the injected numbers, and records the event', async () => {
      transaction.contents.findFirst.mockResolvedValue(LINKED);
      const service = new LinkChangeService(prisma, { views: null });

      const result = await service.replace(CONTENT_ID, admin, {
        platform: 'instagram',
        url: OTHER_REEL,
      });

      expect(transaction.content_links.updateMany).toHaveBeenCalledWith({
        where: { id: 'link-ig', url: REEL },
        data: {
          views: null,
          url: OTHER_REEL,
          normalized_url: 'instagram:D1aBc',
          submitted_at: TODAY,
          submitted_by: ADMIN_USER,
        },
      });
      expect(transaction.contents.updateMany).not.toHaveBeenCalled();
      expect(transaction.content_links.createMany).not.toHaveBeenCalled();
      expect(
        transaction.content_events.createMany.mock.calls[0][0].data,
      ).toEqual([
        expect.objectContaining({
          event_type: 'Link Replaced',
          occurred_at: NOW,
        }),
      ]);
      expect(result.submittedAt).toBe('2026-10-05');
    });

    it('clears nothing beyond the link itself until performance numbers exist', async () => {
      transaction.contents.findFirst.mockResolvedValue(LINKED);

      await new LinkChangeService(prisma).replace(CONTENT_ID, creator, {
        platform: 'instagram',
        url: OTHER_REEL,
      });

      expect(
        Object.keys(transaction.content_links.updateMany.mock.calls[0][0].data),
      ).toEqual(['url', 'normalized_url', 'submitted_at', 'submitted_by']);
    });

    it('answers 409 when another replacement changed the link first', async () => {
      transaction.contents.findFirst.mockResolvedValue(LINKED);
      transaction.content_links.updateMany.mockResolvedValue({ count: 0 });

      expect(
        (
          await refusal(
            new LinkChangeService(prisma).replace(CONTENT_ID, creator, {
              platform: 'instagram',
              url: OTHER_REEL,
            }),
          )
        ).body,
      ).toEqual({
        code: 'LINK_CHANGED',
        message: 'Link ini baru saja diganti. Muat ulang lalu coba lagi',
      });
      expect(transaction.content_events.createMany).not.toHaveBeenCalled();
    });

    it('answers a replacement with a video already on another content as taken', async () => {
      transaction.contents.findFirst.mockResolvedValue(LINKED);
      transaction.content_links.updateMany.mockRejectedValue(
        uniqueViolation(['normalized_url']),
      );

      expect(
        (
          await refusal(
            new LinkChangeService(prisma).replace(CONTENT_ID, creator, {
              platform: 'instagram',
              url: OTHER_REEL,
            }),
          )
        ).body,
      ).toMatchObject({ code: 'VIDEO_LINK_TAKEN' });
    });
  });
});
