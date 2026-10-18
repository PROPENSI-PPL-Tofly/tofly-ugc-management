import { Module } from '@nestjs/common';
import { RateFormulaModule } from '../rate-formula/rate-formula.module.js';
import { InvoicesController } from './invoices.controller.js';
import { InvoicesService } from './invoices.service.js';
import { RATE_FORMULA_SOURCE } from './rate-formula.js';
import { StoredRateFormulaSource } from './stored-rate-formula.source.js';

@Module({
  imports: [RateFormulaModule],
  controllers: [InvoicesController],
  providers: [
    InvoicesService,
    // The formula admins saved in "Atur Formula Rate" (8.1).
    { provide: RATE_FORMULA_SOURCE, useClass: StoredRateFormulaSource },
  ],
})
export class InvoicesModule {}
