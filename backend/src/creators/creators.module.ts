import { Module } from '@nestjs/common';
import {
  CONTRACT_END_AUDIT,
  PendingContractEndAudit,
} from './contract-end-audit.js';
import { ContractEndController } from './contract-end.controller.js';
import { ContractEndService } from './contract-end.service.js';
import { ContractPeriodsController } from './contract-periods.controller.js';
import { ContractPeriodsService } from './contract-periods.service.js';
import {
  CREATOR_EDIT_AUDIT,
  CREATOR_EDIT_NOTIFIER,
  PendingCreatorEditAudit,
  silentCreatorEditNotifier,
} from './creator-edit-ports.js';
import { CreatorEditService } from './creator-edit.service.js';
import { CreatorOnboardingService } from './creator-onboarding.service.js';
import { CreatorsController } from './creators.controller.js';
import { CreatorsService } from './creators.service.js';

@Module({
  controllers: [CreatorsController, ContractPeriodsController, ContractEndController],
  providers: [
    CreatorsService,
    CreatorOnboardingService,
    ContractPeriodsService,
    ContractEndService,
    // TODO(PBI-23, 23.5): useExisting: AuditLogger once the audit log store is merged.
    { provide: CONTRACT_END_AUDIT, useClass: PendingContractEndAudit },
    CreatorEditService,
    // PBI-23, 23.5: becomes useExisting: AuditLogger when the audit log store is merged.
    { provide: CREATOR_EDIT_AUDIT, useClass: PendingCreatorEditAudit },
    // PBI-11, 11.2: becomes useExisting: CreatorEmails when it answers these two events.
    { provide: CREATOR_EDIT_NOTIFIER, useValue: silentCreatorEditNotifier },
  ],
})
export class CreatorsModule {}
