import {
  Body,
  Controller,
  Post,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard, type AdminRequest } from '../auth/admin.guard.js';
import { unauthenticated } from '../auth/creator-request.js';
import { checkBulkExportRequest } from './bulk-export-request.js';
import { InvoiceExportService } from './invoice-export.service.js';

const XLSX_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** The admin's bulk download. A separate controller keeps the invoice read routes untouched. */
@Controller('invoices')
@UseGuards(AdminGuard)
export class InvoiceExportController {
  constructor(private readonly exports: InvoiceExportService) {}

  @Post('bulk-export')
  async bulkExport(
    @Body() body: unknown,
    @Req() request: Pick<AdminRequest, 'principal'>,
  ): Promise<StreamableFile> {
    // The guard already answered; this is the same defence in depth the other write routes use.
    if (request.principal?.role !== 'admin') throw unauthenticated();

    const result = await this.exports.export(
      checkBulkExportRequest(body),
      new Date(),
    );

    return new StreamableFile(result.workbook, {
      type: XLSX_TYPE,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
    });
  }
}
