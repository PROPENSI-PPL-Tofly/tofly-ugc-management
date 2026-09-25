import { SubmissionRevisionRepository } from './submission-revision.repository.js';

describe('SubmissionRevisionRepository', () => {
  it('stores the revision note and changes the content status to draft_revision', async () => {
    const submissionId = '550e8400-e29b-41d4-a716-446655440000';
    const contentId = '550e8400-e29b-41d4-a716-446655440001';

    const submissionUpdate = vi.fn().mockResolvedValue({
      id: submissionId,
      content_id: contentId,
      revision_notes: 'Mohon perbaiki bagian pembuka.',
    });

    const contentUpdate = vi.fn().mockResolvedValue({
      id: contentId,
      status: 'draft_revision',
    });

    const transaction = vi.fn(async (callback) =>
      callback({
        submissions: {
          update: submissionUpdate,
        },
        contents: {
          update: contentUpdate,
        },
      }),
    );

    const repository = new SubmissionRevisionRepository({
      $transaction: transaction,
    });

    const result = await repository.saveRevision(
      submissionId,
      contentId,
      'Mohon perbaiki bagian pembuka.',
    );

    expect(submissionUpdate).toHaveBeenCalledWith({
      where: {
        id: submissionId,
      },
      data: {
        revision_notes: 'Mohon perbaiki bagian pembuka.',
      },
    });

    expect(contentUpdate).toHaveBeenCalledWith({
      where: {
        id: contentId,
      },
      data: {
        status: 'draft_revision',
      },
    });

    expect(result).toEqual({
      id: submissionId,
      status: 'draft_revision',
      revisionNotes: 'Mohon perbaiki bagian pembuka.',
    });
  });
});