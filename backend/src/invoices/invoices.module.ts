import { Module } from '@nestjs/common';
import { PerformanceSyncModule } from '../performance/sync/performance-sync.module.js';
import { RateFormulaModule } from '../rate-formula/rate-formula.module.js';
import { InvoicePaymentsModule } from './invoice-payments.module.js';
import { InvoiceCommandService } from './invoice-command.service.js';
import { InvoiceConfirmationService } from './invoice-confirmation.service.js';
import { INVOICE_ROSTER_REPOSITORY } from './invoice-roster.repository.js';
import { INVOICE_STATUS_SOURCE } from './invoice-status.js';
import { InvoicesController } from './invoices.controller.js';
import { InvoicesService } from './invoices.service.js';
import { LAST_SYNC } from './last-sync.js';
import { PerformanceLastSync } from './performance-last-sync.adapter.js';
import { PersistedInvoiceStatusSource } from './persisted-invoice-status.source.js';
import { PrismaInvoiceRosterRepository } from './prisma-invoice-roster.repository.js';
import { RATE_FORMULA_SOURCE } from './rate-formula.js';
import { StoredRateFormulaSource } from './stored-rate-formula.source.js';

@Module({
  // The payment proof each row shows (PBI-13); 27.4's sync for Finalize's last sync (PBI-28).
  imports: [RateFormulaModule, InvoicePaymentsModule, PerformanceSyncModule],
  controllers: [InvoicesController],
  providers: [
    InvoicesService,
    // The creators, contracts and content the running invoice is calculated from (Repository).
    {
      provide: INVOICE_ROSTER_REPOSITORY,
      useClass: PrismaInvoiceRosterRepository,
    },
    // The admin's adjustments and finalizing (PBI-12), for this module's admin-only controller.
    // Not exported: the creator's routes that import this module cannot inject them.
    InvoiceCommandService,
    // The formula admins saved in "Atur Formula Rate" (8.1).
    { provide: RATE_FORMULA_SOURCE, useClass: StoredRateFormulaSource },
    // Where each invoice stands, from the lifecycle finalizing saves (PBI-12).
    { provide: INVOICE_STATUS_SOURCE, useClass: PersistedInvoiceStatusSource },
    // The creator's acknowledge and receipt confirmation (13.1).
    InvoiceConfirmationService,
    // Finalize's last sync (PBI-28 AC 7): 27.4's syncContract behind the LastSync port (Adapter).
    { provide: LAST_SYNC, useClass: PerformanceLastSync },
  ],
  // The creator's routes in MeModule read their invoices and make their moves through these.
  exports: [InvoicesService, InvoiceConfirmationService, InvoicePaymentsModule],
})
export class InvoicesModule {}
