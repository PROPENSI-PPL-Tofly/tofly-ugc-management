import { ConflictException } from '@nestjs/common';
import {
  SubmissionReviewService,
  type SubmissionReviewClient,
} from './submission-review.service.js';

const SUBMISSION_ID = '0f9c2f5e-6b1a-4f3e-9a51-3c1d2e4b5a60';
const CONTENT_ID = 'a08576d2-15a7-4ed0-bf4b-f5a28c2d65a0';
const ADMIN_USER_ID = '11111111-1111-4111-8111-111111111111';

describe('SubmissionReviewService transactional approval race', () => {
  it('rejects approval when the transactional status update affects zero rows', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });

    const transaction = {
      contents: {
        updateMany,
      },
      users: {
        findUnique: vi.fn().mockResolvedValue({
          email: 'admin@example.test',
        }),
      },
      content_events: {
        create: vi.fn().mockResolvedValue({ id: 'event-id' }),
      },
    };

    const base: SubmissionReviewClient = {
      submissions: {
        findUnique: vi.fn().mockResolvedValue({
          id: SUBMISSION_ID,
          content_id: CONTENT_ID,
          contents: {
            status: 'draft_review',
            submissions: [{ id: SUBMISSION_ID }],
          },
        }),
      },
      contents: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const client: SubmissionReviewClient & {
      $transaction: (
        work: (tx: typeof transaction) => Promise<unknown>,
      ) => Promise<unknown>;
    } = {
      ...base,
      $transaction: vi.fn(
        async (work: (tx: typeof transaction) => Promise<unknown>) =>
          work(transaction),
      ),
    };

    const service = new SubmissionReviewService(client);

    await expect(
      service.approve(SUBMISSION_ID, ADMIN_USER_ID),
    ).rejects.toMatchObject({
      status: 409,
      response: {
        code: 'DRAFT_NOT_REVIEWABLE',
        message: 'Draft ini sudah tidak menunggu keputusan',
      },
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: CONTENT_ID,
        status: {
          in: ['draft_review'],
        },
      },
      data: {
        status: 'draft_approved',
      },
    });

    expect(transaction.users.findUnique).not.toHaveBeenCalled();
    expect(transaction.content_events.create).not.toHaveBeenCalled();
  });
});
