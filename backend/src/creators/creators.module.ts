import { Module } from '@nestjs/common';
import { ContractPeriodsController } from './contract-periods.controller.js';
import { ContractPeriodsService } from './contract-periods.service.js';
import { CreatorOnboardingService } from './creator-onboarding.service.js';
import { CreatorsController } from './creators.controller.js';
import { CreatorsService } from './creators.service.js';

@Module({
  controllers: [CreatorsController, ContractPeriodsController],
  providers: [CreatorsService, CreatorOnboardingService, ContractPeriodsService],
})
export class CreatorsModule {}
