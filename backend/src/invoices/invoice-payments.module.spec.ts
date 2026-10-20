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
});
