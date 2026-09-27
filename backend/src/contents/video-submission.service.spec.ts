import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { content_status, social_platform } from '@prisma/client';
import {
  VideoSubmissionService,
  type VideoSubmissionClient,
} from './video-submission.service.js';

const CONTENT_ID = '7d0c5f1e-3b1a-4c2e-9f4d-2a6b8c0d1e2f';
const CREATOR_ID = '0b5e2c9a-6f3d-4e1b-8a7c-9d2f4e6a8b1c';
const APPROVED_DEADLINE = new Date('2026-10-30T00:00:00.000Z');
const GRACE_DEADLINE = new Date('2026-10-20T00:00:00.000Z');
const REEL = 'https://www.instagram.com/reel/C8abc/';
const TIKTOK = 'https://www.tiktok.com/@creator/video/123';
const SUBMITTED_AT = new Date('2026-10-19T00:00:00.000Z');

function stub(options: {
  content?: {
    id: string;
    status: content_status;
    deadline: Date;
  } | null;
  updated?: number;
}) {
  const transaction = {
    contents: {
      findFirst: vi.fn().mockResolvedValue(
        options.content === undefined
          ? {
              id: CONTENT_ID,
              status: 'draft_approved' as const,
              deadline: APPROVED_DEADLINE,
            }
          : options.content,
      ),
      updateMany: vi.fn().mockResolvedValue({ count: options.updated ?? 1 }),
    },
  };

  const client = {
    $transaction: vi.fn(async (work) => work(transaction)),
  } satisfies VideoSubmissionClient;

  return {
    client,
    transaction,
    service: new VideoSubmissionService(client),
  };
}

async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }

  throw new Error('expected the video submission to be refused');
}

describe('VideoSubmissionService.submit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-19T04:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('looks the content up only among the calling creator’s committed contents', async () => {
    const { transaction, service } = stub({});

    await service.submit(CONTENT_ID, CREATOR_ID, {
      videoLink: REEL,
    });

    expect(transaction.contents.findFirst).toHaveBeenCalledWith({
      where: {
        id: CONTENT_ID,
        is_proposal: false,
        contracts: { creator_id: CREATOR_ID },
      },
      select: {
        id: true,
        status: true,
        deadline: true,
      },
    });
  });

  it('submits an approved content, stores the final link, platform, date, and status together', async () => {
    const { transaction, service } = stub({});

    const result = await service.submit(CONTENT_ID, CREATOR_ID, {
      videoLink: REEL,
    });

    expect(transaction.contents.updateMany).toHaveBeenCalledWith({
      where: {
        id: CONTENT_ID,
        status: 'draft_approved',
      },
      data: {
        status: 'link_submitted',
        video_link: REEL,
        video_submitted_at: SUBMITTED_AT,
        platform: 'instagram',
      },
    });

    expect(result).toEqual({
      contentId: CONTENT_ID,
      status: 'link_submitted',
      videoLink: REEL,
      platform: 'instagram',
      submittedAt: SUBMITTED_AT.toISOString(),
    });
  });

  it('stores TikTok as the detected platform', async () => {
    const { transaction, service } = stub({});

    await service.submit(CONTENT_ID, CREATOR_ID, {
      videoLink: TIKTOK,
    });

    expect(transaction.contents.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          platform: 'tiktok' as social_platform,
        }),
      }),
    );
  });

  it.each([
    'scheduled',
    'draft_review',
    'draft_revision',
    'draft_revised',
  ] as const)('allows %s during the H-1 grace window', async (status) => {
    const { transaction, service } = stub({
      content: {
        id: CONTENT_ID,
        status,
        deadline: GRACE_DEADLINE,
      },
    });

    await expect(
      service.submit(CONTENT_ID, CREATOR_ID, {
        videoLink: REEL,
      }),
    ).resolves.toMatchObject({
      status: 'link_submitted',
    });

    expect(transaction.contents.updateMany).toHaveBeenCalledOnce();
  });

  it.each([
    'scheduled',
    'draft_review',
    'draft_revision',
    'draft_revised',
  ] as const)('rejects %s before the H-1 grace window', async (status) => {
    const { transaction, service } = stub({
      content: {
        id: CONTENT_ID,
        status,
        deadline: APPROVED_DEADLINE,
      },
    });

    const error = await failure(
      service.submit(CONTENT_ID, CREATOR_ID, {
        videoLink: REEL,
      }),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'VIDEO_NOT_ELIGIBLE',
    });
    expect(transaction.contents.updateMany).not.toHaveBeenCalled();
  });

  it('allows draft-approved content before the grace window', async () => {
    const { service } = stub({
      content: {
        id: CONTENT_ID,
        status: 'draft_approved',
        deadline: APPROVED_DEADLINE,
      },
    });

    await expect(
      service.submit(CONTENT_ID, CREATOR_ID, {
        videoLink: REEL,
      }),
    ).resolves.toMatchObject({
      status: 'link_submitted',
    });
  });

  it('never allows link_submitted content to submit another video', async () => {
    const { transaction, service } = stub({
      content: {
        id: CONTENT_ID,
        status: 'link_submitted',
        deadline: GRACE_DEADLINE,
      },
    });

    const error = await failure(
      service.submit(CONTENT_ID, CREATOR_ID, {
        videoLink: REEL,
      }),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toEqual({
      code: 'VIDEO_NOT_ELIGIBLE',
      message: 'Link video untuk konten ini sudah dikirim',
    });
    expect(transaction.contents.updateMany).not.toHaveBeenCalled();
  });

  it('answers 404 for missing, another creator’s, or proposal content without leaking its existence', async () => {
    const { transaction, service } = stub({
      content: null,
    });

    const error = await failure(
      service.submit(CONTENT_ID, CREATOR_ID, {
        videoLink: REEL,
      }),
    );

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getResponse()).toEqual({
      code: 'CONTENT_NOT_FOUND',
      message: 'Konten tidak ditemukan',
    });
    expect(transaction.contents.updateMany).not.toHaveBeenCalled();
  });

  it('answers 409 when another request changed the status first', async () => {
    const { transaction, service } = stub({
      updated: 0,
    });

    const error = await failure(
      service.submit(CONTENT_ID, CREATOR_ID, {
        videoLink: REEL,
      }),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'VIDEO_NOT_ELIGIBLE',
    });
  });

  it('rejects a non-Instagram/TikTok link before touching the database', async () => {
    const { client, service } = stub({});

    const error = await failure(
      service.submit(CONTENT_ID, CREATOR_ID, {
        videoLink: 'https://www.youtube.com/shorts/abc',
      }),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(client.$transaction).not.toHaveBeenCalled();
  });
});
