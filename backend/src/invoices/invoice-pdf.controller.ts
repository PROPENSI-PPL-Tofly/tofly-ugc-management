import {
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AdminGuard } from '../auth/admin.guard.js';
import { sendDownload } from '../storage/open-file-response.js';
import { InvoicePdfService, type PdfDocument } from './invoice-pdf.service.js';

/**
 * "Unduh Invoice" and "Unduh Receipt" in an admin's Rincian (PBI-31): any invoice's documents, as
 * files to save. The service decides which status allows which document.
 */
@Controller('invoices')
@UseGuards(AdminGuard)
export class InvoicePdfController {
  constructor(
    @Inject(InvoicePdfService)
    private readonly pdfs: Pick<InvoicePdfService, 'forContract'>,
  ) {}

  @Get(':contractId/invoice-pdf')
  async invoice(
    @Param('contractId', new ParseUUIDPipe()) contractId: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.send(res, contractId, 'invoice');
  }

  @Get(':contractId/receipt-pdf')
  async receipt(
    @Param('contractId', new ParseUUIDPipe()) contractId: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.send(res, contractId, 'receipt');
  }

  private async send(res: Response, contractId: string, document: PdfDocument): Promise<void> {
    const file = await this.pdfs.forContract(contractId, {}, document);
    sendDownload(res, { ...file, contentType: 'application/pdf' });
  }
}
