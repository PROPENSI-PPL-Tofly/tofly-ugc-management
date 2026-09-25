import { SubmissionRevisionService } from './submission-revision.service.js';

describe('SubmissionRevisionService', () => {
  it('stores the revision note and changes a review submission to revision', async () => {
    const submission = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      status: 'review',
    };

    const findById = vi.fn().mockResolvedValue(submission);

    const saveRevision = vi.fn().mockResolvedValue({
      id: submission.id,
      status: 'revision',
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
      'Mohon perbaiki bagian pembuka.',
    );

    expect(result).toEqual({
      id: submission.id,
      status: 'revision',
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
it('rejects a submission that is not in review status', async () => {
  const submission = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    status: 'approved',
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
    status: 'review',
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
});