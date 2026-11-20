import { Module } from '@nestjs/common';
import { SuperAdminBootstrap } from './super-admin-bootstrap.js';

/** Sets the first Super Admin from SUPER_ADMIN_EMAIL when the backend starts (PBI-23). */
@Module({ providers: [SuperAdminBootstrap] })
export class SuperAdminModule {}
