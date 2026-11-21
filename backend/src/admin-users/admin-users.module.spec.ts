import { MODULE_METADATA } from '@nestjs/common/constants';
import { AdminUsersController } from './admin-users.controller.js';
import { AdminUsersModule } from './admin-users.module.js';
import { AdminUsersService } from './admin-users.service.js';

describe('AdminUsersModule', () => {
  it('serves Pengguna Admin with its service', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AdminUsersModule),
    ).toEqual([AdminUsersController]);
    expect(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AdminUsersModule),
    ).toEqual([AdminUsersService]);
  });
});
