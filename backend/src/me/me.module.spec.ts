import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MeModule } from './me.module.js';
import { MyContentsController } from './my-contents.controller.js';
import { MyContentsService } from './my-contents.service.js';
import { MyInvoicePaymentsController } from './my-invoice-payments.controller.js';
import { MyInvoicesController } from './my-invoices.controller.js';
import { MyInvoicesService } from './my-invoices.service.js';
import { MyProposalsController } from './my-proposals.controller.js';
import { MyProposalsService } from './my-proposals.service.js';

describe('MeModule', () => {
  it('provides the Task Saya controller and service', async () => {
    const module = await Test.createTestingModule({
      imports: [MeModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    expect(module.get(MyContentsController)).toBeDefined();
    expect(module.get(MyContentsService)).toBeDefined();
  });

  it("provides the creator's invoice comment and payment proof routes", async () => {
    const module = await Test.createTestingModule({
      imports: [MeModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    expect(module.get(MyInvoicePaymentsController)).toBeDefined();
  });

  it("provides the creator's invoice list and the acknowledge and receipt confirmation routes", async () => {
    const module = await Test.createTestingModule({
      imports: [MeModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    expect(module.get(MyInvoicesController)).toBeDefined();
    expect(module.get(MyInvoicesService)).toBeDefined();
  });

  // PBI-14: "Ajukan Konten" and "Batalkan Pengajuan". Without the global deadline buffer module
  // in this isolated module the service falls back to the default buffer, so it still builds.
  it("provides the creator's proposal routes", async () => {
    const module = await Test.createTestingModule({
      imports: [MeModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    expect(module.get(MyProposalsController)).toBeDefined();
    expect(module.get(MyProposalsService)).toBeDefined();
  });

  it('is part of the application', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      AppModule,
    ) as unknown[];

    expect(imports).toContain(MeModule);
  });
});
