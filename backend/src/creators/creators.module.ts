import { Module } from '@nestjs/common';
import { CreatorEmails } from '../email/creator-emails.js';
import { CREATOR_NOTIFIER } from '../email/creator-notifier.js';
import { EmailModule } from '../email/email.module.js';
import {
  CONTRACT_END_AUDIT,
  PendingContractEndAudit,
} from './contract-end-audit.js';
import { ContractEndController } from './contract-end.controller.js';
import { ContractEndService } from './contract-end.service.js';
import { ContractPeriodsController } from './contract-periods.controller.js';
import { ContractPeriodsService } from './contract-periods.service.js';
import { CreatorOnboardingService } from './creator-onboarding.service.js';
import { CreatorsController } from './creators.controller.js';
import { CreatorsService } from './creators.service.js';

@Module({
  // A new account, a new period and an early end email the creator (PBI-11).
  imports: [EmailModule],
  controllers: [CreatorsController, ContractPeriodsController, ContractEndController],
  providers: [
    CreatorsService,
    CreatorOnboardingService,
    ContractPeriodsService,
    ContractEndService,
    // TODO(PBI-23, 23.5): useExisting: AuditLogger once the audit log store is merged.
    { provide: CONTRACT_END_AUDIT, useClass: PendingContractEndAudit },
    { provide: CREATOR_NOTIFIER, useExisting: CreatorEmails },
  ],
})
export class CreatorsModule {}
