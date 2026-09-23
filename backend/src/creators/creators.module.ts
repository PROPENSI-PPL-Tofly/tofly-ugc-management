import { Module } from '@nestjs/common';
import { CreatorsController } from './creators.controller.js';
import { CreatorsService } from './creators.service.js';

@Module({
  controllers: [CreatorsController],
  providers: [CreatorsService],
})
export class CreatorsModule {}
