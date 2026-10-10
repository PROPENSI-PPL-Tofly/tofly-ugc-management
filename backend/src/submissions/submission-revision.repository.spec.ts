import { SubmissionRevisionRepository } from './submission-revision.repository.js';

const ADMIN_USER_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_EMAIL = 'admin@example.test';

describe('SubmissionRevisionRepository', () => {
  it('records Revision Requested in the revision transaction with the Admin identity and note', async () => {
    const submissionId = '550e8400-e29b-41d4-a716-446655440000';
    const contentId = '550e8400-e29b-41d4-a716-446655440001';
    const revisionNotes = 'Mohon perbaiki bagian pembuka.';
    const updateManyContent = vi.fn().mockResolvedValue({ count: 1 });
    const updateSubmission = vi.fn().mockResolvedValue({
      id: submissionId,
      content_id: contentId,
      revision_notes: revisionNotes,
    });
    const transaction = {
      submissions: { update: updateSubmission },
      contents: { updateMany: updateManyContent },
      users: {
        findUnique: vi.fn().mockResolvedValue({ id: ADMIN_USER_ID }),
      },
      content_events: {
        create: vi.fn().mockResolvedValue({ id: 'event-id' }),
      },
    };
    const runTransaction = vi.fn(
      async (callback: (tx: typeof transaction) => Promise<any>) =>
        callback(transaction),
    );
    const repository = new SubmissionRevisionRepository({
      submissions: { findUnique: vi.fn() },
      $transaction: runTransaction,
    });

    await Reflect.apply(repository.saveRevision, repository, [
      submissionId,
      contentId,
      revisionNotes,
      ADMIN_USER_ID,
    ]);

    expect(transaction.users.findUnique).toHaveBeenCalledWith({
      where: { id: ADMIN_USER_ID },
      select: { id: true },
    });
    expect(transaction.content_events.create).toHaveBeenCalledWith({
      data: {
        content_id: contentId,
        event_type: 'Revision Requested',
        actor_name: 'Admin',
        actor_role: 'admin',
        actor_user_id: ADMIN_USER_ID,
        occurred_at: expect.any(Date),
        event_data: { revision_note: revisionNotes },
      },
    });
    expect(runTransaction).toHaveBeenCalledOnce();
    expect(updateManyContent.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.content_events.create.mock.invocationCallOrder[0],
    );
    expect(updateSubmission.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.content_events.create.mock.invocationCallOrder[0],
    );
  });

  it('stores the revision note and changes the content status to draft_revision', async () => {
  const submissionId = '550e8400-e29b-41d4-a716-446655440000';
  const contentId = '550e8400-e29b-41d4-a716-446655440001';

  const updateSubmission = vi.fn().mockResolvedValue({
    id: submissionId,
    content_id: contentId,
    revision_notes: 'Mohon perbaiki bagian pembuka.',
  });

  const updateManyContent = vi.fn().mockResolvedValue({
    count: 1,
  });

  const repository = new SubmissionRevisionRepository({
    submissions: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(async (callback) =>
      callback({
        submissions: {
          update: updateSubmission,
        },
        contents: {
          updateMany: updateManyContent,
        },
      }),
    ),
  });

  const result = await repository.saveRevision(
    submissionId,
    contentId,
    'Mohon perbaiki bagian pembuka.',
  );

  expect(updateManyContent).toHaveBeenCalledExactlyOnceWith({
    where: {
      id: contentId,
      status: {
        in: ['draft_review'],
      },
    },
    data: {
      status: 'draft_revision',
    },
  });

  expect(updateSubmission).toHaveBeenCalledExactlyOnceWith({
    where: {
      id: submissionId,
    },
    data: {
      revision_notes: 'Mohon perbaiki bagian pembuka.',
    },
  });

  expect(result).toEqual({
    id: submissionId,
    contentId,
    status: 'draft_revision',
    revisionNotes: 'Mohon perbaiki bagian pembuka.',
  });
});

  it('answers with the content id of the row it saved, not the one it was handed', async () => {
    const requestedContentId = '550e8400-e29b-41d4-a716-446655440001';
    const savedContentId = '550e8400-e29b-41d4-a716-446655440099';

    const repository = new SubmissionRevisionRepository({
      submissions: {
        findUnique: vi.fn(),
      },
      $transaction: vi.fn(async (callback) =>
        callback({
          submissions: {
            update: vi.fn().mockResolvedValue({
              id: '550e8400-e29b-41d4-a716-446655440000',
              content_id: savedContentId,
              revision_notes: 'Mohon perbaiki bagian pembuka.',
            }),
          },
          contents: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        }),
      ),
    });

    const result = await repository.saveRevision(
      '550e8400-e29b-41d4-a716-446655440000',
      requestedContentId,
      'Mohon perbaiki bagian pembuka.',
    );

    expect(result).toHaveProperty('contentId', savedContentId);
  });

  it('does not save the revision note when the content is no longer reviewable', async () => {
  const submissionId = '550e8400-e29b-41d4-a716-446655440000';
  const contentId = '550e8400-e29b-41d4-a716-446655440001';

  const updateSubmission = vi.fn().mockResolvedValue({
    id: submissionId,
    content_id: contentId,
    revision_notes: 'Mohon perbaiki draft ini.',
  });

  const updateContent = vi.fn().mockResolvedValue({
    id: contentId,
    status: 'draft_revision',
  });

  const updateManyContent = vi.fn().mockResolvedValue({
    count: 0,
  });

  const repository = new SubmissionRevisionRepository({
    submissions: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(async (callback) =>
      callback({
        submissions: {
          update: updateSubmission,
        },
        contents: {
          update: updateContent,
          updateMany: updateManyContent,
        },
      }),
    ),
  });

  const result = await repository.saveRevision(
    submissionId,
    contentId,
    'Mohon perbaiki draft ini.',
  );

  expect(updateManyContent).toHaveBeenCalledExactlyOnceWith({
    where: {
      id: contentId,
      status: {
        in: ['draft_review'],
      },
    },
    data: {
      status: 'draft_revision',
    },
  });

  expect(updateSubmission).not.toHaveBeenCalled();

  expect(result).toBeNull();
});
  it('finds a submission with its content ID, current status, and latest state', async () => {
  const submissionId = '550e8400-e29b-41d4-a716-446655440000';
  const contentId = '550e8400-e29b-41d4-a716-446655440001';

  const findUnique = vi.fn().mockResolvedValue({
    id: submissionId,
    content_id: contentId,
    contents: {
      status: 'draft_review',
      submissions: [
        {
          id: submissionId,
        },
      ],
    },
  });

  const repository = new SubmissionRevisionRepository({
    submissions: {
      findUnique,
    },
    $transaction: vi.fn(),
  });

  const result = await repository.findById(submissionId);

  expect(findUnique).toHaveBeenCalledExactlyOnceWith({
    where: {
      id: submissionId,
    },
    select: {
      id: true,
      content_id: true,
      contents: {
        select: {
          status: true,
          submissions: {
            orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
            take: 1,
            select: {
              id: true,
            },
          },
        },
      },
    },
  });

  expect(result).toEqual({
    id: submissionId,
    content_id: contentId,
    status: 'draft_review',
    isLatest: true,
  });
});
it('marks an older submission as not latest', async () => {
  const submissionId = '550e8400-e29b-41d4-a716-446655440000';
  const contentId = '550e8400-e29b-41d4-a716-446655440001';

  const findUnique = vi.fn().mockResolvedValue({
    id: submissionId,
    content_id: contentId,
    contents: {
      status: 'draft_review',
      submissions: [
        {
          id: '550e8400-e29b-41d4-a716-446655440099',
        },
      ],
    },
  });

  const repository = new SubmissionRevisionRepository({
    submissions: {
      findUnique,
    },
    $transaction: vi.fn(),
  });

  const result = await repository.findById(submissionId);

  expect(result).toEqual({
    id: submissionId,
    content_id: contentId,
    status: 'draft_review',
    isLatest: false,
  });
});
it('returns null when the submission does not exist', async () => {
  const findUnique = vi.fn().mockResolvedValue(null);

  const repository = new SubmissionRevisionRepository({
    submissions: { findUnique },
    $transaction: vi.fn(),
  });

  const result = await repository.findById(
    '550e8400-e29b-41d4-a716-446655440000',
  );

  expect(findUnique).toHaveBeenCalledExactlyOnceWith({
  where: {
    id: '550e8400-e29b-41d4-a716-446655440000',
  },
  select: {
    id: true,
    content_id: true,
    contents: {
      select: {
        status: true,
        submissions: {
          orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
          take: 1,
          select: {
            id: true,
          },
        },
      },
    },
  },
});

  expect(result).toBeNull();
});

  it('treats a content whose submissions vanished mid-request as not latest', async () => {
    const submissionId = '550e8400-e29b-41d4-a716-446655440000';

    const repository = new SubmissionRevisionRepository({
      submissions: {
        findUnique: vi.fn().mockResolvedValue({
          id: submissionId,
          content_id: '550e8400-e29b-41d4-a716-446655440001',
          contents: { status: 'draft_review', submissions: [] },
        }),
      },
      $transaction: vi.fn(),
    });

    await expect(repository.findById(submissionId)).resolves.toMatchObject({
      isLatest: false,
    });
  });
});
