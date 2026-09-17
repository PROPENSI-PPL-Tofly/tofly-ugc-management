import { Module } from '@nestjs/common';
import { CLOCK, systemClock } from '../common/clock.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CreatorsController } from './creators.controller.js';
import { CreatorsService } from './creators.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [CreatorsController],
  providers: [CreatorsService, { provide: CLOCK, useValue: systemClock }],
})
export class CreatorsModule {}
