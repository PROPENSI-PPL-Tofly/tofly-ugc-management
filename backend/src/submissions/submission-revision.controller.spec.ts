import { SubmissionRevisionController } from './submission-revision.controller.js';

describe('SubmissionRevisionController', () => {
  it('forwards the submission ID and revision note and returns the service result', async () => {
    const submissionId = '550e8400-e29b-41d4-a716-446655440000';
    const body = { revisionNotes: 'Mohon perbaiki bagian pembuka.' };
    const result = { id: submissionId, status: 'draft_revision' };
    const revise = vi.fn().mockResolvedValue(result);
    const controller = new SubmissionRevisionController({ revise });

    await expect(controller.revise(submissionId, body)).resolves.toEqual(result);

    expect(revise).toHaveBeenCalledExactlyOnceWith(submissionId, body);
  });
});
