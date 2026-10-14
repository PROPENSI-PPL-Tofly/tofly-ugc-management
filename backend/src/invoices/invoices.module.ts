import { Module } from '@nestjs/common';
import { InvoicesController } from './invoices.controller.js';
import { InvoicesService } from './invoices.service.js';
import {
  PlaceholderRateFormulaSource,
  RATE_FORMULA_SOURCE,
} from './rate-formula.js';

@Module({
  controllers: [InvoicesController],
  providers: [
    InvoicesService,
    // Until 8.1 stores the formula, the placeholder answers; swapping it is this one line.
    { provide: RATE_FORMULA_SOURCE, useClass: PlaceholderRateFormulaSource },
  ],
})
export class InvoicesModule {}
