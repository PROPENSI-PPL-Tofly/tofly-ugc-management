import { MODULE_METADATA } from '@nestjs/common/constants';
import { InvoiceCommandService } from './invoice-command.service.js';
import { AdminEmails } from '../email/admin-emails.js';
import { ADMIN_NOTIFIER } from '../email/admin-notifier.js';
import { CreatorEmails } from '../email/creator-emails.js';
import { CREATOR_NOTIFIER } from '../email/creator-notifier.js';
import { EmailModule } from '../email/email.module.js';
import { InvoicesController } from './invoices.controller.js';
import { InvoicesModule } from './invoices.module.js';
import { InvoicePdfController } from './invoice-pdf.controller.js';
import { InvoicePdfService } from './invoice-pdf.service.js';
import { InvoicesService } from './invoices.service.js';
import { RateFormulaModule } from '../rate-formula/rate-formula.module.js';
import { RATE_FORMULA_SOURCE } from './rate-formula.js';
import { StoredRateFormulaSource } from './stored-rate-formula.source.js';
import { INVOICE_STATUS_SOURCE } from './invoice-status.js';
import { PersistedInvoiceStatusSource } from './persisted-invoice-status.source.js';
import { Test } from '@nestjs/testing';
import { PerformanceSyncModule } from '../performance/sync/performance-sync.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LAST_SYNC } from './last-sync.js';
import { PerformanceLastSync } from './performance-last-sync.adapter.js';
import { INVOICE_ROSTER_REPOSITORY } from './invoice-roster.repository.js';
import { PrismaInvoiceRosterRepository } from './prisma-invoice-roster.repository.js';

describe('InvoicesModule', () => {
  // PBI-31: the admin's Unduh PDF route, and the PDF service the creator's route imports.
  it("serves invoice PDFs and lends the PDF service to the creator's routes", () => {
    expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, InvoicesModule)).toContain(
      InvoicePdfController,
    );
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, InvoicesModule)).toContain(
      InvoicePdfService,
    );
    expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, InvoicesModule)).toContain(
      InvoicePdfService,
    );
  });

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

  it('reads the roster and its content through the Prisma repository (28.1)', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, InvoicesModule),
    ).toContainEqual({
      provide: INVOICE_ROSTER_REPOSITORY,
      useClass: PrismaInvoiceRosterRepository,
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

  // Finalize's last sync (PBI-28 AC 7) is 27.4's own sync, reached through the adapter.
  it("takes Finalize's last sync from 27.4's sync module, through PerformanceLastSync", () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, InvoicesModule),
    ).toContain(PerformanceSyncModule);
    expect(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, InvoicesModule),
    ).toContainEqual({ provide: LAST_SYNC, useClass: PerformanceLastSync });
  });

  it('builds the last sync the way the app does', async () => {
    const module = await Test.createTestingModule({ imports: [InvoicesModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    expect(module.get(LAST_SYNC)).toBeInstanceOf(PerformanceLastSync);
  });

  // PBI-11 (11.2): Finalize emails the creator.
  it('hands Finalize the creator emails', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, InvoicesModule) as unknown[];
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, InvoicesModule) as unknown[];

    expect(imports).toContain(EmailModule);
    expect(providers).toContainEqual({ provide: CREATOR_NOTIFIER, useExisting: CreatorEmails });
    // PBI-11 (11.2, AC 5): an acknowledged invoice emails every Admin.
    expect(providers).toContainEqual({ provide: ADMIN_NOTIFIER, useExisting: AdminEmails });
  });
});
