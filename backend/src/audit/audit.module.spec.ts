import { GLOBAL_MODULE_METADATA } from '@nestjs/common/constants.js';
import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RateFormulaService } from '../rate-formula/rate-formula.service.js';
import { AuditLogger } from './audit-logger.js';
import { AuditModule } from './audit.module.js';

describe('AuditModule', () => {
  it('is global, so a feature module needs no import to record an action', () => {
    expect(Reflect.getMetadata(GLOBAL_MODULE_METADATA, AuditModule)).toBe(true);
  });

  it('is part of the app', () => {
    expect(Reflect.getMetadata('imports', AppModule)).toContain(AuditModule);
  });

  it('hands a service the AuditLogger Nest holds, not one of its own', async () => {
    const module = await Test.createTestingModule({
      imports: [AuditModule],
      providers: [RateFormulaService, { provide: PrismaService, useValue: {} }],
    }).compile();

    const service = module.get(RateFormulaService) as unknown as {
      audit: AuditLogger;
    };

    expect(service.audit).toBe(module.get(AuditLogger, { strict: false }));
  });
});
