import {
  Controller,
  DefaultValuePipe,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AdminGuard } from '../auth/admin.guard.js';
import { checkPaging, DEFAULT_PAGE_SIZE } from '../creators/paging.js';
import type {
  InvoiceDetail,
  InvoiceListResponse,
} from './dto/invoice-list.dto.js';
import { jakartaDay } from '../creators/evergreen.js';
import { toInvoiceCsv } from './invoice-csv.js';
import { checkInvoiceFilters } from './invoice-filters.js';
import { checkInvoiceSort } from './invoice-sort.js';
import {
  InvoicesService,
  type InvoiceDetailReader,
  type InvoiceLister,
} from './invoices.service.js';

/**
 * The running invoice of every creator, for the Rate & Invoicing table (8.4), and of one
 * creator, for its breakdown popups (8.5).
 */
@Controller('invoices')
@UseGuards(AdminGuard)
export class InvoicesController {
  constructor(
    @Inject(InvoicesService)
    private readonly invoices: InvoiceLister & InvoiceDetailReader,
  ) {}

  // The pipes turn anything that is not an integer into a 400 before this runs; checkPaging
  // then keeps the integers inside the range the listing can serve. checkInvoiceFilters does
  // the same job for q, contract and status, and checkInvoiceSort for sort and order.
  @Get()
  async list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(DEFAULT_PAGE_SIZE), ParseIntPipe)
    pageSize: number,
    @Query('q') q?: string,
    @Query('contract') contract?: string,
    @Query('status') status?: string,
    @Query('sort') sort?: string,
    @Query('order') order?: string,
  ): Promise<InvoiceListResponse> {
    return this.invoices.list(
      checkPaging(page, pageSize),
      new Date(),
      checkInvoiceFilters(q, contract, status),
      checkInvoiceSort(sort, order),
    );
  }

  /**
   * The table as a CSV file: the same filters and order, every page. Declared before
   * :creatorId so "export" is never read as an id. The file names the day in Jakarta and is not
   * kept by any cache, as it lists who is owed what.
   */
  @Get('export')
  async exportCsv(
    @Query('q') q: string | undefined,
    @Query('contract') contract: string | undefined,
    @Query('status') status: string | undefined,
    @Query('sort') sort: string | undefined,
    @Query('order') order: string | undefined,
    @Res({ passthrough: true }) res: Pick<Response, 'setHeader'>,
  ): Promise<string> {
    const filters = checkInvoiceFilters(q, contract, status);
    const ordering = checkInvoiceSort(sort, order);
    const now = new Date();
    const items = await this.invoices.exportAll(now, filters, ordering);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="rate-invoicing-${jakartaDay(now)}.csv"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    return toInvoiceCsv(items);
  }

  // ParseUUIDPipe answers 400 for an id that is not a UUID before the database is asked.
  @Get(':creatorId')
  async detail(
    @Param('creatorId', ParseUUIDPipe) creatorId: string,
  ): Promise<InvoiceDetail> {
    const detail = await this.invoices.detail(creatorId, new Date());
    if (!detail) {
      throw new NotFoundException({
        code: 'INVOICE_NOT_FOUND',
        message: 'Creator tidak ditemukan atau belum punya kontrak',
      });
    }
    return detail;
  }
}
