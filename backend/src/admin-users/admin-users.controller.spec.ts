import {
  BadRequestException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { GUARDS_METADATA, HTTP_CODE_METADATA } from '@nestjs/common/constants';
import type { AdminRequest } from '../auth/admin.guard.js';
import { SuperAdminGuard } from '../auth/super-admin.guard.js';
import { AdminUsersController } from './admin-users.controller.js';
import type { AppSessionService } from '../auth/session/session.service.js';
import type { AdminConfirmationService } from './admin-confirmation.service.js';
import type { AdminUsersService } from './admin-users.service.js';

// SCRUM-246 (PBI-23): "Pengguna Admin" answers Super Admins only (AC 3, OWASP A01:2025).

const SUPER: Pick<AdminRequest, 'principal'> = {
  principal: { userId: 'user-super', role: 'admin', adminRole: 'super_admin' },
};
const ID = '0b8f2a8e-4a39-4f4e-9d61-2f1f6f1c0a11';

const COOKIE = '__session';

function setup(confirmed = false) {
  const service = {
    list: vi.fn().mockResolvedValue({ items: [] }),
    create: vi.fn().mockResolvedValue({ id: 'new' }),
    update: vi.fn().mockResolvedValue({ id: ID }),
    reactivate: vi.fn().mockResolvedValue({ id: ID }),
    deactivate: vi.fn().mockResolvedValue({ id: ID }),
  };
  const sessions = {
    cookieName: vi.fn(() => COOKIE),
    isConfirmed: vi.fn().mockResolvedValue(confirmed),
  };
  const confirmation = {
    request: vi.fn().mockResolvedValue({ validMinutes: 10 }),
    verify: vi.fn().mockResolvedValue({ confirmedUntil: 'later' }),
  };
  const controller = new AdminUsersController(
    service as unknown as AdminUsersService,
    sessions as unknown as AppSessionService,
    confirmation as unknown as AdminConfirmationService,
  );
  return { service, sessions, confirmation, controller };
}

const SIGNED_IN = { ...SUPER, cookies: { [COOKIE]: 'opaque-id' } };

describe('AdminUsersController', () => {
  it('is guarded by SuperAdminGuard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AdminUsersController)).toEqual([
      SuperAdminGuard,
    ]);
  });

  it('lists 10 a page with the trimmed search, for the signed-in Super Admin', async () => {
    const { service, controller } = setup();

    await controller.list(2, '  sinta ', SUPER);

    expect(service.list).toHaveBeenCalledWith(
      { page: 2, pageSize: 10 },
      'sinta',
      'user-super',
    );
  });

  it.each([
    ['a page below 1', 0, undefined],
    ['a search over 100 characters', 1, 'q'.repeat(101)],
  ])('answers 400 for %s', async (_label, page, q) => {
    const { controller } = setup();

    await expect(controller.list(page, q, SUPER)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('adds an Admin from a checked body, saying whether this session confirmed', async () => {
    const { service, sessions, controller } = setup(true);

    await controller.create(
      { name: 'Sinta', email: 'Sinta@Tofly.id', role: 'admin' },
      SIGNED_IN,
    );

    expect(sessions.isConfirmed).toHaveBeenCalledWith('opaque-id');
    expect(service.create).toHaveBeenCalledWith(
      { name: 'Sinta', email: 'sinta@tofly.id', role: 'admin' },
      'user-super',
      true,
    );
  });

  // SuperAdminGuard lets no request without a session through; if one came, it is unconfirmed.
  it('reads a request with no session cookie as unconfirmed', async () => {
    const { sessions, controller } = setup();

    await controller.deactivate(ID, SUPER);

    expect(sessions.isConfirmed).toHaveBeenCalledWith('');
  });

  it('refuses a body with wrong fields before the service runs', async () => {
    const { service, controller } = setup();

    await expect(controller.create({}, SUPER)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(service.create).not.toHaveBeenCalled();
  });

  it('changes an Admin\'s name and role, saying whether this session confirmed', async () => {
    const { service, controller } = setup();

    await controller.update(ID, { name: ' Sinta D. ', role: 'super_admin' }, SIGNED_IN);

    expect(service.update).toHaveBeenCalledWith(
      ID,
      { name: 'Sinta D.', role: 'super_admin' },
      'user-super',
      false,
    );
  });

  it('deactivates an Admin, answering 200', async () => {
    const { service, controller } = setup(true);

    await controller.deactivate(ID, SIGNED_IN);

    expect(service.deactivate).toHaveBeenCalledWith(ID, 'user-super', true);
    expect(
      Reflect.getMetadata(HTTP_CODE_METADATA, AdminUsersController.prototype.deactivate),
    ).toBe(200);
  });

  it('emails a confirmation code to the signed-in Super Admin', async () => {
    const { confirmation, controller } = setup();

    await expect(controller.requestConfirmation(SIGNED_IN)).resolves.toEqual({
      validMinutes: 10,
    });
    expect(confirmation.request).toHaveBeenCalledWith('user-super');
  });

  it('checks a confirmation code for this session', async () => {
    const { confirmation, controller } = setup();

    await controller.verifyConfirmation({ code: '482193' }, SIGNED_IN);

    expect(confirmation.verify).toHaveBeenCalledWith('user-super', 'opaque-id', '482193');
  });

  it('refuses a code that is not six digits before checking it', async () => {
    const { confirmation, controller } = setup();

    await expect(
      controller.verifyConfirmation({ code: 'abc' }, SIGNED_IN),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(confirmation.verify).not.toHaveBeenCalled();
  });

  it('reactivates an Admin, answering 200, passing on whether this session entered the code', async () => {
    const { service, sessions, controller } = setup(true);

    await controller.reactivate(ID, SIGNED_IN);

    expect(sessions.isConfirmed).toHaveBeenCalledWith('opaque-id');
    expect(service.reactivate).toHaveBeenCalledWith(ID, 'user-super', true);
    expect(
      Reflect.getMetadata(HTTP_CODE_METADATA, AdminUsersController.prototype.reactivate),
    ).toBe(200);
  });

  // AdminGuard's local stand-in lets a request with no session through; no actor, no change.
  it.each([
    ['list', (c: AdminUsersController) => c.list(1, undefined, {})],
    ['create', (c: AdminUsersController) => c.create({ name: 'A', email: 'a@t.id', role: 'admin' }, {})],
    ['update', (c: AdminUsersController) => c.update(ID, { name: 'A' }, {})],
    ['reactivate', (c: AdminUsersController) => c.reactivate(ID, {})],
    ['deactivate', (c: AdminUsersController) => c.deactivate(ID, {})],
    ['request a code', (c: AdminUsersController) => c.requestConfirmation({})],
    ['verify a code', (c: AdminUsersController) => c.verifyConfirmation({ code: '482193' }, {})],
  ])('answers 401 to %s with no signed-in Admin', async (_label, act) => {
    const { controller } = setup();

    await expect(act(controller)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
