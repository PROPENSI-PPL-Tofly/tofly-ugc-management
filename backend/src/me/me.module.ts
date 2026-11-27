import { Module } from '@nestjs/common';
import { DevCreatorGuard } from '../auth/dev-creator.guard.js';
import { InvoicePaymentsModule } from '../invoices/invoice-payments.module.js';
import { InvoicesModule } from '../invoices/invoices.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ContentDetailService } from '../contents/content-detail.service.js';
import { MeDashboardController } from './me-dashboard.controller.js';
import { MeDashboardService } from './me-dashboard.service.js';
import { MyContentsController } from './my-contents.controller.js';
import { MyContentsService } from './my-contents.service.js';
import { MyInvoicePaymentsController } from './my-invoice-payments.controller.js';
import { MyInvoicesController } from './my-invoices.controller.js';
import { MyInvoicesService } from './my-invoices.service.js';
import { MyProposalsController } from './my-proposals.controller.js';
import { MyProposalsService } from './my-proposals.service.js';

@Module({
  imports: [PrismaModule, InvoicePaymentsModule, InvoicesModule],
  controllers: [
    MeDashboardController,
    MyContentsController,
    MyInvoicePaymentsController,
    MyInvoicesController,
    MyProposalsController,
  ],
  providers: [
    MeDashboardService,
    MyContentsService,
    ContentDetailService,
    DevCreatorGuard,
    MyInvoicesService,
    MyProposalsService,
  ],
})
export class MeModule {}
