import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { Clock } from '../common/clock.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { MyTaskService, type TaskRow } from './my-task.service.js';
import type { ContentStatus } from './task-rules.js';

const TODAY = new Date('2026-09-17T08:00:00.000Z');
const CREATOR_ID = 'creator-1';
const CONTENT_ID = 'content-1';
const REEL = 'https://www.instagram.com/reel/C8abc/';

function day(offset: number): Date {
  const date = new Date('2026-09-17T00:00:00.000Z');
  date.setUTCDate(date.getUTCDate() + offset);
  return date;
}

function submittedRow(): TaskRow {
  return {
    id: CONTENT_ID,
    name: 'Review Serum',
    type: 'evergreen',
    brief: '',
    deadline: day(10),
    status: 'link_submitted',
    videoLink: REEL,
    platform: 'instagram',
    submissions: [],
  };
}

function prismaWith(
  current: { status: ContentStatus; deadline: Date } | null,
  claimed = 1,
) {
  const tx = {
    content: {
      findFirst: vi.fn().mockResolvedValue(current),
      updateMany: vi.fn().mockResolvedValue({ count: claimed }),
      findUniqueOrThrow: vi.fn().mockResolvedValue(submittedRow()),
    },
  };
  const prisma = {
    $transaction: vi.fn((work: (client: typeof tx) => unknown) => work(tx)),
  } as unknown as PrismaService;
  const clock: Clock = { now: () => TODAY };
  return { service: new MyTaskService(prisma, clock), tx, prisma };
}

describe('MyTaskService.submitVideo', () => {
  it('marks approved content as link submitted, dated today, with the platform', async () => {
    const { service, tx } = prismaWith({
      status: 'draft_approved',
      deadline: day(10),
    });

    const task = await service.submitVideo(CREATOR_ID, CONTENT_ID, {
      link: REEL,
    });

    expect(tx.content.findFirst).toHaveBeenCalledWith({
      where: {
        id: CONTENT_ID,
        isProposal: false,
        contract: { creatorId: CREATOR_ID },
      },
      select: { status: true, deadline: true },
    });
    expect(tx.content.updateMany).toHaveBeenCalledWith({
      where: {
        id: CONTENT_ID,
        status: { not: 'link_submitted' },
        OR: [
          { status: 'draft_approved' },
          { deadline: { lte: new Date('2026-09-18T00:00:00.000Z') } },
        ],
      },
      data: {
        status: 'link_submitted',
        videoLink: REEL,
        videoSubmittedAt: new Date('2026-09-17T00:00:00.000Z'),
        platform: 'instagram',
      },
    });
    expect(task).toMatchObject({
      status: 'link_submitted',
      platform: 'instagram',
    });
  });

  it('stores TikTok when the link is a TikTok one', async () => {
    const { service, tx } = prismaWith({
      status: 'draft_approved',
      deadline: day(10),
    });

    await service.submitVideo(CREATOR_ID, CONTENT_ID, {
      link: 'https://vm.tiktok.com/ZSabc123/',
    });

    expect(tx.content.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ platform: 'tiktok' }),
      }),
    );
  });

  it.each<[ContentStatus, number]>([
    ['scheduled', 1],
    ['draft_review', 1],
    ['draft_revision', 0],
    ['scheduled', -2],
  ])(
    'lets %s content through inside the grace window (deadline in %i days)',
    async (status, offset) => {
      const { service, tx } = prismaWith({ status, deadline: day(offset) });

      await expect(
        service.submitVideo(CREATOR_ID, CONTENT_ID, { link: REEL }),
      ).resolves.toMatchObject({ status: 'link_submitted' });
      expect(tx.content.updateMany).toHaveBeenCalled();
    },
  );

  it.each<ContentStatus>([
    'scheduled',
    'draft_review',
    'draft_revision',
    'draft_revised',
  ])('answers 409 for %s content two days out', async (status) => {
    const { service, tx } = prismaWith({ status, deadline: day(2) });

    const attempt = service.submitVideo(CREATOR_ID, CONTENT_ID, {
      link: REEL,
    });

    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await expect(attempt).rejects.toMatchObject({
      response: { code: 'VIDEO_NOT_ALLOWED', status },
    });
    expect(tx.content.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a second link, even inside the grace window', async () => {
    const { service } = prismaWith({
      status: 'link_submitted',
      deadline: day(0),
    });

    await expect(
      service.submitVideo(CREATOR_ID, CONTENT_ID, { link: REEL }),
    ).rejects.toMatchObject({
      response: {
        code: 'VIDEO_NOT_ALLOWED',
        message: 'Link video untuk konten ini sudah dikirim',
      },
    });
  });

  it('answers 409 when the status changed between the read and the write', async () => {
    const { service } = prismaWith(
      { status: 'draft_approved', deadline: day(10) },
      0,
    );

    await expect(
      service.submitVideo(CREATOR_ID, CONTENT_ID, { link: REEL }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("reports someone else's or missing content as not found", async () => {
    const { service } = prismaWith(null);

    await expect(
      service.submitVideo(CREATOR_ID, CONTENT_ID, { link: REEL }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses a non Instagram/TikTok link before touching the database', async () => {
    const { service, prisma } = prismaWith({
      status: 'draft_approved',
      deadline: day(10),
    });

    await expect(
      service.submitVideo(CREATOR_ID, CONTENT_ID, {
        link: 'https://youtube.com/shorts/abc',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
