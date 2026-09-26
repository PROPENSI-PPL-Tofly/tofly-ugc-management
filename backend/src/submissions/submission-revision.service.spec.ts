import { SubmissionRevisionService } from './submission-revision.service.js';

describe('SubmissionRevisionService', () => {
  it('stores the revision note and changes a review submission to draft_revision', async () => {
    const submission = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      content_id: '550e8400-e29b-41d4-a716-446655440001',
      status: 'draft_review',
      isLatest: true,
    };

    const findById = vi.fn().mockResolvedValue(submission);

    const saveRevision = vi.fn().mockResolvedValue({
      id: submission.id,
      status: 'draft_revision',
      revisionNotes: 'Mohon perbaiki bagian pembuka.',
    });

    const service = new SubmissionRevisionService({
      findById,
      saveRevision,
    });

    const result = await service.revise(submission.id, {
      revisionNotes: 'Mohon perbaiki bagian pembuka.',
    });

    expect(findById).toHaveBeenCalledExactlyOnceWith(submission.id);

    expect(saveRevision).toHaveBeenCalledExactlyOnceWith(
      submission.id,
      submission.content_id,
      'Mohon perbaiki bagian pembuka.',
    );

    expect(result).toEqual({
      id: submission.id,
      status: 'draft_revision',
      revisionNotes: 'Mohon perbaiki bagian pembuka.',
    });
  });

  it('rejects when the submission does not exist', async () => {
    const findById = vi.fn().mockResolvedValue(null);
    const saveRevision = vi.fn();

    const service = new SubmissionRevisionService({
      findById,
      saveRevision,
    });

    await expect(
      service.revise('missing-submission-id', {
        revisionNotes: 'Please revise this draft.',
      }),
    ).rejects.toThrow();

    expect(findById).toHaveBeenCalledExactlyOnceWith(
      'missing-submission-id',
    );

    expect(saveRevision).not.toHaveBeenCalled();
  });

  it('rejects a submission that is not in draft_review status', async () => {
    const submission = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  content_id: '550e8400-e29b-41d4-a716-446655440001',
  status: 'draft_approved',
  isLatest: true,
};

    const findById = vi.fn().mockResolvedValue(submission);
    const saveRevision = vi.fn();

    const service = new SubmissionRevisionService({
      findById,
      saveRevision,
    });

    await expect(
      service.revise(submission.id, {
        revisionNotes: 'Please revise this draft.',
      }),
    ).rejects.toThrow();

    expect(saveRevision).not.toHaveBeenCalled();
  });

  it('passes the related content ID when saving the revision', async () => {
    const submission = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      content_id: '550e8400-e29b-41d4-a716-446655440001',
      status: 'draft_review',
      isLatest: true,
    };

    const findById = vi.fn().mockResolvedValue(submission);

    const saveRevision = vi.fn().mockResolvedValue({
      id: submission.id,
      status: 'draft_revision',
      revisionNotes: 'Mohon perbaiki bagian pembuka.',
    });

    const service = new SubmissionRevisionService({
      findById,
      saveRevision,
    });

    await service.revise(submission.id, {
      revisionNotes: 'Mohon perbaiki bagian pembuka.',
    });

    expect(saveRevision).toHaveBeenCalledExactlyOnceWith(
      submission.id,
      submission.content_id,
      'Mohon perbaiki bagian pembuka.',
    );
  });
  it('allows revision for a resubmitted draft', async () => {
  const submission = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    content_id: '550e8400-e29b-41d4-a716-446655440001',
    status: 'draft_revised',
    isLatest: true,
  };

  const findById = vi.fn().mockResolvedValue(submission);

  const saveRevision = vi.fn().mockResolvedValue({
    id: submission.id,
    status: 'draft_revision',
    revisionNotes: 'Mohon perbaiki bagian akhir.',
  });

  const service = new SubmissionRevisionService({
    findById,
    saveRevision,
  });

  await service.revise(submission.id, {
    revisionNotes: 'Mohon perbaiki bagian akhir.',
  });

  expect(saveRevision).toHaveBeenCalledExactlyOnceWith(
    submission.id,
    submission.content_id,
    'Mohon perbaiki bagian akhir.',
  );
});
it('rejects a submission that has been superseded by a newer submission', async () => {
  const submission = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    content_id: '550e8400-e29b-41d4-a716-446655440001',
    status: 'draft_review',
    isLatest: false,
  };

  const findById = vi.fn().mockResolvedValue(submission);
  const saveRevision = vi.fn();

  const service = new SubmissionRevisionService({
    findById,
    saveRevision,
  });

  await expect(
    service.revise(submission.id, {
      revisionNotes: 'Mohon perbaiki draft ini.',
    }),
  ).rejects.toMatchObject({
    status: 409,
    response: {
      code: 'SUBMISSION_SUPERSEDED',
      message: 'Creator sudah mengirim draft yang lebih baru',
    },
  });

  expect(saveRevision).not.toHaveBeenCalled();
});
it('rejects when the submission becomes non-reviewable during revision', async () => {
  const submission = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    content_id: '550e8400-e29b-41d4-a716-446655440001',
    status: 'draft_review',
    isLatest: true,
  };

  const findById = vi.fn().mockResolvedValue(submission);

  // Simulates another request approving/revising the draft first
  const saveRevision = vi.fn().mockResolvedValue(null);

  const service = new SubmissionRevisionService({
    findById,
    saveRevision,
  });

  await expect(
    service.revise(submission.id, {
      revisionNotes: 'Mohon perbaiki draft ini.',
    }),
  ).rejects.toMatchObject({
    status: 409,
    response: {
      code: 'DRAFT_NOT_REVIEWABLE',
      message: 'Draft ini sudah tidak menunggu keputusan',
    },
  });

  expect(saveRevision).toHaveBeenCalledExactlyOnceWith(
    submission.id,
    submission.content_id,
    'Mohon perbaiki draft ini.',
  );
});
});