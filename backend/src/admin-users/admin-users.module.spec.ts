import { MODULE_METADATA } from '@nestjs/common/constants';
import { AdminConfirmationService } from './admin-confirmation.service.js';
import { AdminUsersController } from './admin-users.controller.js';
import { AdminUsersModule } from './admin-users.module.js';
import { AdminUsersService } from './admin-users.service.js';

describe('AdminUsersModule', () => {
  it('serves Pengguna Admin with its service', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AdminUsersModule),
    ).toEqual([AdminUsersController]);
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      AdminUsersModule,
    ) as unknown[];
    expect(providers).toContain(AdminUsersService);
    expect(providers).toContainEqual(
      expect.objectContaining({ provide: AdminConfirmationService }),
    );
  });
});
