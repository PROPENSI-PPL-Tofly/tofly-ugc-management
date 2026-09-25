import { SubmissionRevisionRepository } from './submission-revision.repository.js';

describe('SubmissionRevisionRepository', () => {
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
        in: ['draft_review', 'draft_revised'],
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
    status: 'draft_revision',
    revisionNotes: 'Mohon perbaiki bagian pembuka.',
  });
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
        in: ['draft_review', 'draft_revised'],
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
});