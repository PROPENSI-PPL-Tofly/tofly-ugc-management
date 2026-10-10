import { UnauthorizedException } from '@nestjs/common';
import { SubmissionRevisionRepository } from './submission-revision.repository.js';

const SUBMISSION_ID = '550e8400-e29b-41d4-a716-446655440000';
const CONTENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const ADMIN_USER_ID = '11111111-1111-4111-8111-111111111111';
const REVISION_NOTES = 'Mohon perbaiki bagian pembuka.';

interface TestTransaction {
  submissions: {
    update: ReturnType<typeof vi.fn>;
  };
  contents: {
    updateMany: ReturnType<typeof vi.fn>;
  };
  users?: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  content_events?: {
    create: ReturnType<typeof vi.fn>;
  };
}

function createHarness(options?: {
  includeUsers?: boolean;
  includeContentEvents?: boolean;
  adminFound?: boolean;
}) {
  const transaction: TestTransaction = {
    submissions: {
      update: vi.fn().mockResolvedValue({
        id: SUBMISSION_ID,
        content_id: CONTENT_ID,
        revision_notes: REVISION_NOTES,
      }),
    },
    contents: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };

  if (options?.includeUsers !== false) {
    transaction.users = {
      findUnique: vi
        .fn()
        .mockResolvedValue(
          options?.adminFound === false
            ? null
            : { id: '11111111-1111-4111-8111-111111111111' },
        ),
    };
  }

  if (options?.includeContentEvents !== false) {
    transaction.content_events = {
      create: vi.fn().mockResolvedValue({ id: 'event-id' }),
    };
  }

  const prisma = {
    submissions: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(
      async (callback: (tx: TestTransaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  } as unknown as ConstructorParameters<typeof SubmissionRevisionRepository>[0];

  return {
    repository: new SubmissionRevisionRepository(prisma),
    transaction,
  };
}

describe('SubmissionRevisionRepository audit error paths', () => {
  it('rejects when the transaction has no Admin lookup delegate', async () => {
    const { repository, transaction } = createHarness({
      includeUsers: false,
      includeContentEvents: true,
    });

    await expect(
      repository.saveRevision(
        SUBMISSION_ID,
        CONTENT_ID,
        REVISION_NOTES,
        ADMIN_USER_ID,
      ),
    ).rejects.toThrow(
      'Revision event recording requires event transaction delegates',
    );

    expect(transaction.contents.updateMany).toHaveBeenCalledOnce();
    expect(transaction.submissions.update).toHaveBeenCalledOnce();
    expect(transaction.content_events?.create).not.toHaveBeenCalled();
  });

  it('rejects when the transaction has no content event delegate', async () => {
    const { repository, transaction } = createHarness({
      includeUsers: true,
      includeContentEvents: false,
    });

    await expect(
      repository.saveRevision(
        SUBMISSION_ID,
        CONTENT_ID,
        REVISION_NOTES,
        ADMIN_USER_ID,
      ),
    ).rejects.toThrow(
      'Revision event recording requires event transaction delegates',
    );

    expect(transaction.contents.updateMany).toHaveBeenCalledOnce();
    expect(transaction.submissions.update).toHaveBeenCalledOnce();
    expect(transaction.users?.findUnique).not.toHaveBeenCalled();
  });

  it('rejects when the Admin profile cannot be found', async () => {
    const { repository, transaction } = createHarness({
      adminFound: false,
    });

    await expect(
      repository.saveRevision(
        SUBMISSION_ID,
        CONTENT_ID,
        REVISION_NOTES,
        ADMIN_USER_ID,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(transaction.users?.findUnique).toHaveBeenCalledWith({
      where: { id: ADMIN_USER_ID },
      select: { id: true },
    });

    expect(transaction.content_events?.create).not.toHaveBeenCalled();
  });
});
