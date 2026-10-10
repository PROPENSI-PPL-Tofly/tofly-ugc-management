import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  SubmissionReviewService,
  type SubmissionReviewClient,
} from './submission-review.service.js';

const SUBMISSION_ID = '0f9c2f5e-6b1a-4f3e-9a51-3c1d2e4b5a60';
const OLDER_ID = '7d1e0a44-2c3b-4d5e-8f90-1a2b3c4d5e6f';
const CONTENT_ID = 'a08576d2-15a7-4ed0-bf4b-f5a28c2d65a0';

function stubClient(
  found: {
    status: string;
    latestIds: string[];
  } | null,
  updatedCount = 1,
) {
  return {
    submissions: {
      findUnique: vi.fn().mockResolvedValue(
        found && {
          id: SUBMISSION_ID,
          content_id: CONTENT_ID,
          contents: {
            status: found.status,
            submissions: found.latestIds.map((id) => ({ id })),
          },
        },
      ),
    },
    contents: {
      updateMany: vi.fn().mockResolvedValue({ count: updatedCount }),
    },
  } satisfies SubmissionReviewClient;
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('expected a rejection');
    },
    (error: unknown) => error,
  );
}

describe('SubmissionReviewService.approve', () => {
  it.each(['draft_review'])(
    'approves the latest submission of a draft in %s',
    async (status) => {
      const client = stubClient({ status, latestIds: [SUBMISSION_ID] });

      await expect(
        new SubmissionReviewService(client).approve(SUBMISSION_ID),
      ).resolves.toEqual({
        id: SUBMISSION_ID,
        contentId: CONTENT_ID,
        status: 'draft_approved',
      });
    },
  );

  it('reads the submission with its content status and only the newest hand-in', async () => {
    const client = stubClient({
      status: 'draft_review',
      latestIds: [SUBMISSION_ID],
    });

    await new SubmissionReviewService(client).approve(SUBMISSION_ID);

    expect(client.submissions.findUnique).toHaveBeenCalledWith({
      where: { id: SUBMISSION_ID },
      select: {
        id: true,
        content_id: true,
        contents: {
          select: {
            status: true,
            submissions: {
              orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
              take: 1,
              select: { id: true },
            },
          },
        },
      },
    });
  });

  it('changes the status only while the content is still awaiting review', async () => {
    const client = stubClient({
      status: 'draft_review',
      latestIds: [SUBMISSION_ID],
    });

    await new SubmissionReviewService(client).approve(SUBMISSION_ID);

    expect(client.contents.updateMany).toHaveBeenCalledWith({
      where: {
        id: CONTENT_ID,
        status: { in: ['draft_review'] },
      },
      data: { status: 'draft_approved' },
    });
  });

  it('answers 404 for an unknown submission and writes nothing', async () => {
    const client = stubClient(null);

    const error = await rejection(
      new SubmissionReviewService(client).approve(SUBMISSION_ID),
    );

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getResponse()).toEqual({
      code: 'SUBMISSION_NOT_FOUND',
      message: 'Draft tidak ditemukan',
    });
    expect(client.contents.updateMany).not.toHaveBeenCalled();
  });

  it.each(['scheduled', 'draft_revision', 'draft_approved', 'link_submitted'])(
    'answers 409 for a draft in %s and writes nothing',
    async (status) => {
      const client = stubClient({ status, latestIds: [SUBMISSION_ID] });

      const error = await rejection(
        new SubmissionReviewService(client).approve(SUBMISSION_ID),
      );

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toEqual({
        code: 'DRAFT_NOT_REVIEWABLE',
        message: 'Draft ini sudah tidak menunggu keputusan',
      });
      expect(client.contents.updateMany).not.toHaveBeenCalled();
    },
  );

  it('answers 409 for an older submission after the creator resubmitted', async () => {
    const client = stubClient({
      status: 'draft_review',
      latestIds: [OLDER_ID],
    });

    const error = await rejection(
      new SubmissionReviewService(client).approve(SUBMISSION_ID),
    );

    expect((error as ConflictException).getResponse()).toEqual({
      code: 'SUBMISSION_SUPERSEDED',
      message: 'Creator sudah mengirim draft yang lebih baru',
    });
    expect(client.contents.updateMany).not.toHaveBeenCalled();
  });

  it('treats a content whose submissions vanished mid-request as superseded', async () => {
    const client = stubClient({ status: 'draft_review', latestIds: [] });

    const error = await rejection(
      new SubmissionReviewService(client).approve(SUBMISSION_ID),
    );

    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'SUBMISSION_SUPERSEDED',
    });
  });

  it('answers 409 when another decision changed the status between read and write', async () => {
    const client = stubClient(
      { status: 'draft_review', latestIds: [SUBMISSION_ID] },
      0,
    );

    const error = await rejection(
      new SubmissionReviewService(client).approve(SUBMISSION_ID),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'DRAFT_NOT_REVIEWABLE',
    });
  });

  it('records the approval event with the Admin identity in the status transaction', async () => {
    const base = stubClient({
      status: 'draft_review',
      latestIds: [SUBMISSION_ID],
    });
    const transaction = {
      contents: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      users: {
        findUnique: vi.fn().mockResolvedValue({ email: 'admin@example.test' }),
      },
      content_events: {
        create: vi.fn().mockResolvedValue({ id: 'event-id' }),
      },
    };
    const client: SubmissionReviewClient & {
      $transaction: (
        work: (tx: typeof transaction) => Promise<unknown>,
      ) => Promise<unknown>;
    } = {
      ...base,
      $transaction: vi.fn(async (work) => work(transaction)),
    };

    await expect(
      new SubmissionReviewService(client).approve(SUBMISSION_ID, 'admin-id'),
    ).resolves.toEqual({
      id: SUBMISSION_ID,
      contentId: CONTENT_ID,
      status: 'draft_approved',
    });

    expect(transaction.contents.updateMany).toHaveBeenCalledWith({
      where: { id: CONTENT_ID, status: { in: ['draft_review'] } },
      data: { status: 'draft_approved' },
    });
    expect(transaction.users.findUnique).toHaveBeenCalledWith({
      where: { id: 'admin-id' },
      select: { email: true },
    });
    expect(transaction.content_events.create).toHaveBeenCalledWith({
      data: {
        content_id: CONTENT_ID,
        event_type: 'Draft Approved',
        actor_name: 'admin@example.test',
        actor_role: 'admin',
        occurred_at: expect.any(Date),
        event_data: {},
      },
    });
    expect(base.contents.updateMany).not.toHaveBeenCalled();
    expect(transaction.contents.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.content_events.create.mock.invocationCallOrder[0],
    );
  });

  it('keeps actorless internal approval calls from writing an audit event', async () => {
    const base = stubClient({
      status: 'draft_review',
      latestIds: [SUBMISSION_ID],
    });
    const transaction = {
      contents: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      users: {
        findUnique: vi.fn(),
      },
      content_events: {
        create: vi.fn(),
      },
    };
    const client: SubmissionReviewClient & {
      $transaction: (
        work: (tx: typeof transaction) => Promise<unknown>,
      ) => Promise<unknown>;
    } = {
      ...base,
      $transaction: vi.fn(async (work) => work(transaction)),
    };

    await expect(
      new SubmissionReviewService(client).approve(SUBMISSION_ID),
    ).resolves.toMatchObject({ status: 'draft_approved' });

    expect(transaction.contents.updateMany).toHaveBeenCalledTimes(1);
    expect(transaction.users.findUnique).not.toHaveBeenCalled();
    expect(transaction.content_events.create).not.toHaveBeenCalled();
  });

  it('rejects an authenticated approval when the Admin record is missing', async () => {
    const base = stubClient({
      status: 'draft_review',
      latestIds: [SUBMISSION_ID],
    });
    const transaction = {
      contents: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      users: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      content_events: {
        create: vi.fn(),
      },
    };
    const client: SubmissionReviewClient & {
      $transaction: (
        work: (tx: typeof transaction) => Promise<unknown>,
      ) => Promise<unknown>;
    } = {
      ...base,
      $transaction: vi.fn(async (work) => work(transaction)),
    };

    await expect(
      new SubmissionReviewService(client).approve(SUBMISSION_ID, 'admin-id'),
    ).rejects.toMatchObject({ status: 401 });

    expect(transaction.contents.updateMany).toHaveBeenCalledTimes(1);
    expect(transaction.content_events.create).not.toHaveBeenCalled();
  });

  it('requires a transaction when approval must record an Admin audit event', async () => {
    const client = stubClient({
      status: 'draft_review',
      latestIds: [SUBMISSION_ID],
    });

    await expect(
      new SubmissionReviewService(client).approve(SUBMISSION_ID, 'admin-id'),
    ).rejects.toThrow('Approval event recording requires a transaction client');

    expect(client.contents.updateMany).not.toHaveBeenCalled();
  });
});
