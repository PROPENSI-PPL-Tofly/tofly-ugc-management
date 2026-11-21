import {
  BadRequestException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { GUARDS_METADATA, HTTP_CODE_METADATA } from '@nestjs/common/constants';
import type { AdminRequest } from '../auth/admin.guard.js';
import { SuperAdminGuard } from '../auth/super-admin.guard.js';
import { AdminUsersController } from './admin-users.controller.js';
import type { AdminUsersService } from './admin-users.service.js';

// SCRUM-246 (PBI-23): "Pengguna Admin" answers Super Admins only (AC 3, OWASP A01:2025).

const SUPER: Pick<AdminRequest, 'principal'> = {
  principal: { userId: 'user-super', role: 'admin', adminRole: 'super_admin' },
};
const ID = '0b8f2a8e-4a39-4f4e-9d61-2f1f6f1c0a11';

function setup() {
  const service = {
    list: vi.fn().mockResolvedValue({ items: [] }),
    create: vi.fn().mockResolvedValue({ id: 'new' }),
    rename: vi.fn().mockResolvedValue({ id: ID }),
    reactivate: vi.fn().mockResolvedValue({ id: ID }),
  };
  const controller = new AdminUsersController(
    service as unknown as AdminUsersService,
  );
  return { service, controller };
}

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

  it('adds an Admin from a checked body', async () => {
    const { service, controller } = setup();

    await controller.create(
      { name: 'Sinta', email: 'Sinta@Tofly.id', role: 'admin' },
      SUPER,
    );

    expect(service.create).toHaveBeenCalledWith(
      { name: 'Sinta', email: 'sinta@tofly.id', role: 'admin' },
      'user-super',
    );
  });

  it('refuses a body with wrong fields before the service runs', async () => {
    const { service, controller } = setup();

    await expect(controller.create({}, SUPER)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(service.create).not.toHaveBeenCalled();
  });

  it('renames an Admin', async () => {
    const { service, controller } = setup();

    await controller.rename(ID, { name: ' Sinta D. ' }, SUPER);

    expect(service.rename).toHaveBeenCalledWith(ID, { name: 'Sinta D.' }, 'user-super');
  });

  it('reactivates an Admin, answering 200', async () => {
    const { service, controller } = setup();

    await controller.reactivate(ID, SUPER);

    expect(service.reactivate).toHaveBeenCalledWith(ID, 'user-super');
    expect(
      Reflect.getMetadata(HTTP_CODE_METADATA, AdminUsersController.prototype.reactivate),
    ).toBe(200);
  });

  // AdminGuard's local stand-in lets a request with no session through; no actor, no change.
  it.each([
    ['list', (c: AdminUsersController) => c.list(1, undefined, {})],
    ['create', (c: AdminUsersController) => c.create({ name: 'A', email: 'a@t.id', role: 'admin' }, {})],
    ['rename', (c: AdminUsersController) => c.rename(ID, { name: 'A' }, {})],
    ['reactivate', (c: AdminUsersController) => c.reactivate(ID, {})],
  ])('answers 401 to %s with no signed-in Admin', async (_label, act) => {
    const { controller } = setup();

    await expect(act(controller)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
