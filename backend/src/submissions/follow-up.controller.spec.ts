import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { RequestMethod, UnauthorizedException } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard.js';
import { FollowUpController } from './follow-up.controller.js';

const SUBMISSION = '550e8400-e29b-41d4-a716-446655440000';
const ADMIN = '11111111-1111-4111-8111-111111111111';
const SAVED = {
  id: 'fu-1',
  note: 'Intro juga dipotong ya.',
  at: '2026-11-09T04:00:00.000Z',
  actor: { name: 'Admin' },
};

function controllerWith() {
  const add = vi.fn().mockResolvedValue(SAVED);
  return { controller: new FollowUpController({ add }), add };
}

const asAdmin = { principal: { userId: ADMIN, role: 'admin' } };

describe('FollowUpController', () => {
  // OWASP A01: only a signed-in admin adds a follow-up (Done when 1).
  it('is open to signed-in admins only', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, FollowUpController)).toEqual([
      AdminGuard,
    ]);
  });

  it('answers POST /submissions/:id/followups', () => {
    const handler = FollowUpController.prototype.add;

    expect(Reflect.getMetadata(PATH_METADATA, FollowUpController)).toBe(
      'submissions',
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(':id/followups');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.POST,
    );
  });

  // Positive: the trimmed note and the admin who wrote it go to the service; its answer comes back.
  it('adds the trimmed note as the signed-in admin and answers with it', async () => {
    const { controller, add } = controllerWith();

    await expect(
      controller.add(
        SUBMISSION,
        { note: '  Intro juga dipotong ya.  ' },
        asAdmin,
      ),
    ).resolves.toEqual(SAVED);
    expect(add).toHaveBeenCalledExactlyOnceWith(
      SUBMISSION,
      'Intro juga dipotong ya.',
      ADMIN,
    );
  });

  // Negative (AC 2): an invalid note is refused before anything is kept.
  it('refuses an empty note with 422, keeping nothing', async () => {
    const { controller, add } = controllerWith();

    await expect(
      controller.add(SUBMISSION, { note: '   ' }, asAdmin),
    ).rejects.toMatchObject({
      status: 422,
      response: { errors: { note: 'Catatan susulan tidak boleh kosong' } },
    });
    expect(add).not.toHaveBeenCalled();
  });

  // Negative: a follow-up records its author, so the local stand-in with no admin is refused too.
  it.each([
    ['no signed-in principal', {}],
    [
      'a creator',
      {
        principal: {
          userId: '22222222-2222-4222-8222-222222222222',
          role: 'creator',
          creatorId: '33333333-3333-4333-8333-333333333333',
        },
      },
    ],
  ])('refuses %s with 401, keeping nothing', async (_who, request) => {
    const { controller, add } = controllerWith();

    const error = await controller
      .add(SUBMISSION, { note: 'Catatan' }, request as typeof asAdmin)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect(add).not.toHaveBeenCalled();
  });
});
