import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Clock } from '../common/clock.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { MyTaskService, type TaskRow } from './my-task.service.js';
import type { ContentStatus } from './task-rules.js';

const TODAY = new Date('2026-09-17T08:00:00.000Z');
const CREATOR_ID = 'creator-1';
const CONTENT_ID = 'content-1';

function updatedRow(): TaskRow {
  return {
    id: CONTENT_ID,
    name: 'Review Serum',
    type: 'evergreen',
    brief: '',
    deadline: new Date('2026-09-27T00:00:00.000Z'),
    status: 'draft_review',
    videoLink: null,
    platform: null,
    submissions: [
      {
        link: 'https://drive.example/draft',
        creatorNotes: 'Mohon dicek',
        revisionNotes: null,
        createdAt: TODAY,
      },
    ],
  };
}

/** A Prisma double whose interactive transaction hands the callback the same client. */
function prismaWith(current: { status: ContentStatus } | null, claimed = 1) {
  const tx = {
    content: {
      findFirst: vi.fn().mockResolvedValue(current),
      updateMany: vi.fn().mockResolvedValue({ count: claimed }),
      findUniqueOrThrow: vi.fn().mockResolvedValue(updatedRow()),
    },
    submission: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: vi.fn((work: (client: typeof tx) => unknown) => work(tx)),
  } as unknown as PrismaService;
  const clock: Clock = { now: () => TODAY };
  return { service: new MyTaskService(prisma, clock), tx };
}

const DRAFT = {
  link: 'https://drive.example/draft',
  creatorNotes: 'Mohon dicek',
};

describe('MyTaskService.submitDraft', () => {
  it.each<ContentStatus>(['scheduled', 'draft_revision'])(
    'accepts a draft for %s content and puts it up for review',
    async (status) => {
      const { service, tx } = prismaWith({ status });

      const task = await service.submitDraft(CREATOR_ID, CONTENT_ID, DRAFT);

      expect(tx.content.findFirst).toHaveBeenCalledWith({
        where: {
          id: CONTENT_ID,
          isProposal: false,
          contract: { creatorId: CREATOR_ID },
        },
        select: { status: true },
      });
      expect(tx.content.updateMany).toHaveBeenCalledWith({
        where: {
          id: CONTENT_ID,
          status: { in: ['scheduled', 'draft_revision'] },
        },
        data: { status: 'draft_review' },
      });
      expect(tx.submission.create).toHaveBeenCalledWith({
        data: {
          contentId: CONTENT_ID,
          creatorId: CREATOR_ID,
          link: 'https://drive.example/draft',
          creatorNotes: 'Mohon dicek',
        },
      });
      expect(task.status).toBe('draft_review');
      expect(task.latestDraft?.creatorNotes).toBe('Mohon dicek');
    },
  );

  it('stores an empty note as no note', async () => {
    const { service, tx } = prismaWith({ status: 'scheduled' });

    await service.submitDraft(CREATOR_ID, CONTENT_ID, {
      link: DRAFT.link,
      creatorNotes: '',
    });

    expect(tx.submission.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ creatorNotes: null }),
    });
  });

  it.each<ContentStatus>([
    'draft_review',
    'draft_revised',
    'draft_approved',
    'link_submitted',
  ])('answers 409 for %s content and changes nothing', async (status) => {
    const { service, tx } = prismaWith({ status });

    const attempt = service.submitDraft(CREATOR_ID, CONTENT_ID, DRAFT);

    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await expect(attempt).rejects.toMatchObject({
      response: { code: 'DRAFT_NOT_ALLOWED', status },
    });
    expect(tx.content.updateMany).not.toHaveBeenCalled();
    expect(tx.submission.create).not.toHaveBeenCalled();
  });

  it('answers 409 when a concurrent submit already moved the status on', async () => {
    const { service, tx } = prismaWith({ status: 'scheduled' }, 0);

    await expect(
      service.submitDraft(CREATOR_ID, CONTENT_ID, DRAFT),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.submission.create).not.toHaveBeenCalled();
  });

  it("reports someone else's or missing content as not found", async () => {
    const { service } = prismaWith(null);

    await expect(
      service.submitDraft(CREATOR_ID, CONTENT_ID, DRAFT),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
