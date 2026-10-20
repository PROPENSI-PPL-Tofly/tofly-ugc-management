import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { InvoiceCommentsService } from './invoice-comments.service.js';
import { InvoicePaymentsController } from './invoice-payments.controller.js';
import { PaymentProofService } from './payment-proof.service.js';

/**
 * Paying an invoice (PBI-13): the payment proof and the comment thread. The services are
 * exported for the creator's routes and for any listing that embeds a proof or a thread.
 */
@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [InvoicePaymentsController],
  providers: [PaymentProofService, InvoiceCommentsService],
  exports: [PaymentProofService, InvoiceCommentsService],
})
export class InvoicePaymentsModule {}
