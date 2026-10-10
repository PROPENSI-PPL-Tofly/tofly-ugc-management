import {
  METHOD_METADATA,
  PATH_METADATA,
  GUARDS_METADATA,
} from '@nestjs/common/constants';
import { RequestMethod, UnauthorizedException } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard.js';
import { SubmissionRevisionController } from './submission-revision.controller.js';

describe('SubmissionRevisionController', () => {
  const submissionId = '550e8400-e29b-41d4-a716-446655440000';
  const adminUserId = '11111111-1111-4111-8111-111111111111';
  const body = { revisionNotes: 'Mohon perbaiki bagian pembuka.' };
  const result = { id: submissionId, status: 'draft_revision' };

  it('is open to signed-in admins only', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, SubmissionRevisionController),
    ).toEqual([AdminGuard]);
  });

  it('forwards the submission ID and revision note and returns the service result', async () => {
    const revise = vi.fn().mockResolvedValue(result);
    const controller = new SubmissionRevisionController({ revise });
    const request = {
      principal: { userId: adminUserId, role: 'admin' },
    };

    await expect(
      Reflect.apply(controller.revise, controller, [
        submissionId,
        body,
        request,
      ]),
    ).resolves.toEqual(result);

    expect(revise).toHaveBeenCalledExactlyOnceWith(
      submissionId,
      body,
      adminUserId,
    );
  });

  it('rejects a request with no authenticated principal', async () => {
    const revise = vi.fn().mockResolvedValue(result);
    const controller = new SubmissionRevisionController({ revise });

    const error = await Reflect.apply(controller.revise, controller, [
      submissionId,
      body,
      {},
    ]).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as UnauthorizedException).getResponse()).toEqual({
      code: 'UNAUTHENTICATED',
      message: 'Silakan masuk terlebih dahulu',
    });
    expect(revise).not.toHaveBeenCalled();
  });

  it('rejects a request authenticated as a Creator', async () => {
    const revise = vi.fn().mockResolvedValue(result);
    const controller = new SubmissionRevisionController({ revise });
    const request = {
      principal: {
        userId: '22222222-2222-4222-8222-222222222222',
        role: 'creator',
        creatorId: '33333333-3333-4333-8333-333333333333',
      },
    };

    const error = await Reflect.apply(controller.revise, controller, [
      submissionId,
      body,
      request,
    ]).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as UnauthorizedException).getResponse()).toEqual({
      code: 'UNAUTHENTICATED',
      message: 'Silakan masuk terlebih dahulu',
    });
    expect(revise).not.toHaveBeenCalled();
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
