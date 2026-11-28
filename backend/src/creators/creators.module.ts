import { Module } from '@nestjs/common';
import { AuditLogger } from '../audit/audit-logger.js';
import { CreatorEmails } from '../email/creator-emails.js';
import { CREATOR_NOTIFIER } from '../email/creator-notifier.js';
import { EmailModule } from '../email/email.module.js';
import { CONTRACT_END_AUDIT } from './contract-end-audit.js';
import { ContractEndController } from './contract-end.controller.js';
import { ContractEndService } from './contract-end.service.js';
import { ContractPeriodsController } from './contract-periods.controller.js';
import { ContractPeriodsService } from './contract-periods.service.js';
import {
  CREATOR_EDIT_AUDIT,
  CREATOR_EDIT_NOTIFIER,
} from './creator-edit-ports.js';
import { CreatorEditService } from './creator-edit.service.js';
import { CreatorOnboardingService } from './creator-onboarding.service.js';
import { CreatorsController } from './creators.controller.js';
import { CreatorsService } from './creators.service.js';

@Module({
  // A new account, a new period, an early end and an Ubah Data change of the end date or quota
  // email the creator (PBI-11, PBI-16).
  imports: [EmailModule],
  controllers: [
    CreatorsController,
    ContractPeriodsController,
    ContractEndController,
  ],
  providers: [
    CreatorsService,
    CreatorOnboardingService,
    ContractPeriodsService,
    ContractEndService,
    // PBI-23 (OWASP A09:2025): both write Log Aktivitas through the one global AuditLogger.
    { provide: CONTRACT_END_AUDIT, useExisting: AuditLogger },
    CreatorEditService,
    { provide: CREATOR_EDIT_AUDIT, useExisting: AuditLogger },
    { provide: CREATOR_EDIT_NOTIFIER, useExisting: CreatorEmails },
    { provide: CREATOR_NOTIFIER, useExisting: CreatorEmails },
  ],
})
export class CreatorsModule {}
