import {
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentCreator } from '../auth/current-creator.decorator.js';
import { DevCreatorGuard } from '../auth/dev-creator.guard.js';
import type {
  AcknowledgedInvoiceDto,
  PaidInvoiceDto,
} from '../invoices/dto/invoice-confirmation.dto.js';
import { InvoiceConfirmationService } from '../invoices/invoice-confirmation.service.js';
import {
  InvoicePdfService,
  type PdfDocument,
} from '../invoices/invoice-pdf.service.js';
import { sendDownload } from '../storage/open-file-response.js';
import {
  MyInvoicesService,
  type CreatorInvoicesResponse,
} from './my-invoices.service.js';

/**
 * The creator's own invoices and their two moves on them (PBI-13, 13.1). Whose invoices, and who
 * moves one, is the creator the guard resolved; nothing in the URL or the body says so.
 */
@Controller('me/invoices')
@UseGuards(DevCreatorGuard)
export class MyInvoicesController {
  constructor(
    @Inject(MyInvoicesService)
    private readonly invoices: Pick<MyInvoicesService, 'list'>,
    @Inject(InvoiceConfirmationService)
    private readonly confirmations: Pick<
      InvoiceConfirmationService,
      'acknowledge' | 'confirmReceipt'
    >,
    @Inject(InvoicePdfService)
    private readonly pdfs: Pick<InvoicePdfService, 'forContract'>,
  ) {}

  @Get()
  async list(
    @CurrentCreator() creatorId: string,
  ): Promise<CreatorInvoicesResponse> {
    return this.invoices.list(creatorId, new Date());
  }

  @Post(':contractId/acknowledge')
  async acknowledge(
    @CurrentCreator() creatorId: string,
    @Param('contractId', new ParseUUIDPipe()) contractId: string,
  ): Promise<AcknowledgedInvoiceDto> {
    return this.confirmations.acknowledge(contractId, creatorId);
  }

  /** "Unduh Invoice" (PBI-31): the creator's own invoice only (AC 6), once they acknowledged it. */
  @Get(':contractId/invoice-pdf')
  async invoicePdf(
    @CurrentCreator() creatorId: string,
    @Param('contractId', new ParseUUIDPipe()) contractId: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.sendPdf(res, contractId, creatorId, 'invoice');
  }

  /** "Unduh Receipt" (PBI-31): the creator's own receipt only, once they confirmed the payment. */
  @Get(':contractId/receipt-pdf')
  async receiptPdf(
    @CurrentCreator() creatorId: string,
    @Param('contractId', new ParseUUIDPipe()) contractId: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.sendPdf(res, contractId, creatorId, 'receipt');
  }

  private async sendPdf(
    res: Response,
    contractId: string,
    creatorId: string,
    document: PdfDocument,
  ): Promise<void> {
    const file = await this.pdfs.forContract(contractId, { creatorId }, document);
    sendDownload(res, { ...file, contentType: 'application/pdf' });
  }

  @Post(':contractId/confirm-receipt')
  async confirmReceipt(
    @CurrentCreator() creatorId: string,
    @Param('contractId', new ParseUUIDPipe()) contractId: string,
  ): Promise<PaidInvoiceDto> {
    return this.confirmations.confirmReceipt(contractId, creatorId);
  }
}
