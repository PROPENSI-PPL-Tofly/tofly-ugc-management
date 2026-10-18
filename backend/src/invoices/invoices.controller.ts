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
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard.js';
import { checkPaging, DEFAULT_PAGE_SIZE } from '../creators/paging.js';
import type {
  InvoiceDetail,
  InvoiceListResponse,
} from './dto/invoice-list.dto.js';
import { checkInvoiceFilters } from './invoice-filters.js';
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
  // the same job for q, contract and status.
  @Get()
  async list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(DEFAULT_PAGE_SIZE), ParseIntPipe)
    pageSize: number,
    @Query('q') q?: string,
    @Query('contract') contract?: string,
    @Query('status') status?: string,
  ): Promise<InvoiceListResponse> {
    return this.invoices.list(
      checkPaging(page, pageSize),
      new Date(),
      checkInvoiceFilters(q, contract, status),
    );
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
