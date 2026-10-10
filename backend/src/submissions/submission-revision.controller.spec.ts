import { SubmissionRevisionController } from './submission-revision.controller.js';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { AdminGuard } from '../auth/admin.guard.js';
import { RequestMethod } from '@nestjs/common';

describe('SubmissionRevisionController', () => {
  it('is open to signed-in admins only', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, SubmissionRevisionController),
    ).toEqual([AdminGuard]);
  });

  it('forwards the submission ID and revision note and returns the service result', async () => {
    const submissionId = '550e8400-e29b-41d4-a716-446655440000';
    const adminUserId = '11111111-1111-4111-8111-111111111111';
    const body = { revisionNotes: 'Mohon perbaiki bagian pembuka.' };
    const result = { id: submissionId, status: 'draft_revision' };
    const revise = vi.fn().mockResolvedValue(result);
    const controller = new SubmissionRevisionController({ revise });
    const request = { principal: { userId: adminUserId, role: 'admin' } };

    await expect(
      Reflect.apply(controller.revise, controller, [submissionId, body, request]),
    ).resolves.toEqual(result);

    expect(revise).toHaveBeenCalledExactlyOnceWith(submissionId, body, adminUserId);
  });
  it('exposes PATCH /submissions/:id/revise', () => {
  const controllerPath = Reflect.getMetadata(
    PATH_METADATA,
    SubmissionRevisionController,
  );

  const methodPath = Reflect.getMetadata(
    PATH_METADATA,
    SubmissionRevisionController.prototype.revise,
  );

  const requestMethod = Reflect.getMetadata(
    METHOD_METADATA,
    SubmissionRevisionController.prototype.revise,
  );

  expect(controllerPath).toBe('submissions');
  expect(methodPath).toBe(':id/revise');
  expect(requestMethod).toBe(RequestMethod.PATCH);
});
});
