import { Module } from '@nestjs/common';
import { RateFormulaController } from './rate-formula.controller.js';
import { RateFormulaService } from './rate-formula.service.js';

@Module({
  controllers: [RateFormulaController],
  providers: [RateFormulaService],
  // The invoice calculation (Subtask 8.2) reads the formula through the service.
  exports: [RateFormulaService],
})
export class RateFormulaModule {}
