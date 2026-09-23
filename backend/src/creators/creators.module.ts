import { Module } from '@nestjs/common';
import { CreatorOnboardingService } from './creator-onboarding.service.js';
import { CreatorsController } from './creators.controller.js';
import { CreatorsService } from './creators.service.js';

@Module({
  controllers: [CreatorsController],
  providers: [CreatorsService, CreatorOnboardingService],
})
export class CreatorsModule {}
