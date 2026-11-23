import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module.js';
import { SuperAdminGuard } from '../auth/super-admin.guard.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditLogsController } from './audit-logs.controller.js';
import { AuditLogsModule } from './audit-logs.module.js';
import { AuditLogsService } from './audit-logs.service.js';

describe('AuditLogsModule (SCRUM-296)', () => {
  it('is part of the app', () => {
    expect(Reflect.getMetadata('imports', AppModule)).toContain(
      AuditLogsModule,
    );
  });

  it('serves the routes with the one AuditLogsService it holds', async () => {
    const module = await Test.createTestingModule({
      // PrismaModule is global, as in the app; its client is stubbed so nothing connects.
      imports: [PrismaModule, AuditLogsModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideGuard(SuperAdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    const controller = module.get(AuditLogsController) as unknown as {
      logs: AuditLogsService;
    };

    expect(controller.logs).toBe(module.get(AuditLogsService));
  });
});
