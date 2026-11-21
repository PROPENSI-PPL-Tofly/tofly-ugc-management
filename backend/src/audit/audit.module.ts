import { Global, Module } from '@nestjs/common';
import { AuditLogger } from './audit-logger.js';

// @Global so a feature that changes money, access or contract data can record it without an import.
@Global()
@Module({
  providers: [AuditLogger],
  exports: [AuditLogger],
})
export class AuditModule {}
