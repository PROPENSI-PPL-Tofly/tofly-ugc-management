import { MODULE_METADATA } from '@nestjs/common/constants';
import { CreatorEmails } from '../email/creator-emails.js';
import { CREATOR_NOTIFIER } from '../email/creator-notifier.js';
import { EmailModule } from '../email/email.module.js';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { FILE_STORE } from '../storage/file-store.js';
import { LocalFileStore } from '../storage/local-file-store.js';
import { InvoiceCommentsService } from './invoice-comments.service.js';
import { InvoicePaymentsController } from './invoice-payments.controller.js';
import { InvoicePaymentsModule } from './invoice-payments.module.js';
import { PaymentProofService } from './payment-proof.service.js';

describe('InvoicePaymentsModule', () => {
  it('builds the payment routes with their services and the file store, on its own', async () => {
    const module = await Test.createTestingModule({
      imports: [InvoicePaymentsModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    expect(module.get(InvoicePaymentsController)).toBeDefined();
    expect(module.get(PaymentProofService)).toBeInstanceOf(PaymentProofService);
    expect(module.get(InvoiceCommentsService)).toBeDefined();
    // No STORAGE_BUCKET in the unit tests: the local disk.
    expect(module.get(FILE_STORE)).toBeInstanceOf(LocalFileStore);
  });

  // PBI-11 (11.2): an uploaded payment proof emails the creator.
  it('hands the payment proof service the creator emails', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, InvoicePaymentsModule) as unknown[];
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, InvoicePaymentsModule) as unknown[];

    expect(imports).toContain(EmailModule);
    expect(providers).toContainEqual({ provide: CREATOR_NOTIFIER, useExisting: CreatorEmails });
  });
});
