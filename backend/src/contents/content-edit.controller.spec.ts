import { HttpStatus } from '@nestjs/common';
import { GUARDS_METADATA, HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { AdminGuard, type AdminRequest } from '../auth/admin.guard.js';
import { ContentEditController } from './content-edit.controller.js';
import type { ContentEditor } from './content-edit.service.js';

const CONTENT_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ID = '33333333-3333-4333-8333-333333333333';

function setup() {
  const editor: ContentEditor = {
    update: vi.fn().mockResolvedValue({ id: CONTENT_ID }),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  return { editor, controller: new ContentEditController(editor) };
}

const asAdmin: AdminRequest = {
  headers: {},
  principal: { userId: ADMIN_ID, role: 'admin' },
};

/** The local development stand-in for sign-in lets an admin route in with no principal. */
const asLocalAdmin: AdminRequest = { headers: {} };

describe('ContentEditController', () => {
  it('is open to signed-in admins only (AC 1)', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ContentEditController)).toEqual(
      [AdminGuard],
    );
  });

  it('checks the body and hands the edit to the service as the admin', async () => {
    const { controller, editor } = setup();

    await expect(
      controller.update(
        CONTENT_ID,
        { brief: '  Brief baru ', status: 'x' },
        asAdmin,
      ),
    ).resolves.toEqual({ id: CONTENT_ID });

    expect(editor.update).toHaveBeenCalledWith(
      CONTENT_ID,
      { brief: 'Brief baru' },
      ADMIN_ID,
    );
  });

  it('refuses a body with nothing to change before reaching the service', async () => {
    const { controller, editor } = setup();

    await expect(
      controller.update(CONTENT_ID, {}, asAdmin),
    ).rejects.toMatchObject({
      status: 422,
    });
    expect(editor.update).not.toHaveBeenCalled();
  });

  it('hands the local admin stand-in on with no user id', async () => {
    const { controller, editor } = setup();

    await controller.update(CONTENT_ID, { brief: 'x' }, asLocalAdmin);

    expect(editor.update).toHaveBeenCalledWith(
      CONTENT_ID,
      { brief: 'x' },
      null,
    );
  });

  it('deletes through the service and answers 204 with no body', async () => {
    const { controller, editor } = setup();

    await expect(controller.remove(CONTENT_ID)).resolves.toBeUndefined();

    expect(editor.remove).toHaveBeenCalledWith(CONTENT_ID);
    expect(
      Reflect.getMetadata(
        HTTP_CODE_METADATA,
        ContentEditController.prototype.remove,
      ),
    ).toBe(HttpStatus.NO_CONTENT);
  });
});
