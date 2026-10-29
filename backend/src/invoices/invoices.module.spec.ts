import { MODULE_METADATA } from '@nestjs/common/constants';
import { InvoiceCommandService } from './invoice-command.service.js';
import { InvoicesController } from './invoices.controller.js';
import { InvoicesModule } from './invoices.module.js';
import { InvoicesService } from './invoices.service.js';
import { RateFormulaModule } from '../rate-formula/rate-formula.module.js';
import { RATE_FORMULA_SOURCE } from './rate-formula.js';
import { StoredRateFormulaSource } from './stored-rate-formula.source.js';
import { INVOICE_STATUS_SOURCE } from './invoice-status.js';
import { PersistedInvoiceStatusSource } from './persisted-invoice-status.source.js';

describe('InvoicesModule', () => {
  it('registers the invoices controller and service', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, InvoicesModule),
    ).toContain(InvoicesController);
    expect(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, InvoicesModule),
    ).toContain(InvoicesService);
  });

  // OWASP Top 10:2025 A01 (Broken Access Control): the admin's commands serve this module's
  // admin-only controller; the creator's routes, which import this module, cannot inject them.
  it("keeps the admin's invoice commands to this module and exports only the reads", () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, InvoicesModule),
    ).toContain(InvoiceCommandService);
    expect(
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, InvoicesModule),
    ).not.toContain(InvoiceCommandService);
    expect(
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, InvoicesModule),
    ).toContain(InvoicesService);
  });

  it('invoices with the formula admins saved in Atur Formula Rate (8.1)', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, InvoicesModule),
    ).toContain(RateFormulaModule);
    expect(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, InvoicesModule),
    ).toContainEqual({
      provide: RATE_FORMULA_SOURCE,
      useClass: StoredRateFormulaSource,
    });
  });

  it('reads where each invoice stands from its saved lifecycle (PBI-12)', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, InvoicesModule),
    ).toContainEqual({
      provide: INVOICE_STATUS_SOURCE,
      useClass: PersistedInvoiceStatusSource,
    });
  });
});
