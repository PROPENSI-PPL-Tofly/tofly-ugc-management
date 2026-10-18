import {
  Controller,
  DefaultValuePipe,
  Get,
  Inject,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard.js';
import { checkPaging, DEFAULT_PAGE_SIZE } from '../creators/paging.js';
import type { InvoiceListResponse } from './dto/invoice-list.dto.js';
import { checkInvoiceFilters } from './invoice-filters.js';
import { InvoicesService, type InvoiceLister } from './invoices.service.js';

/** The running invoice of every creator, for the Rate & Invoicing table (8.4). */
@Controller('invoices')
@UseGuards(AdminGuard)
export class InvoicesController {
  constructor(
    @Inject(InvoicesService) private readonly invoices: InvoiceLister,
  ) {}

  // The pipes turn anything that is not an integer into a 400 before this runs; checkPaging
  // then keeps the integers inside the range the listing can serve. checkInvoiceFilters does
  // the same job for q and contract.
  @Get()
  async list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(DEFAULT_PAGE_SIZE), ParseIntPipe)
    pageSize: number,
    @Query('q') q?: string,
    @Query('contract') contract?: string,
  ): Promise<InvoiceListResponse> {
    return this.invoices.list(
      checkPaging(page, pageSize),
      new Date(),
      checkInvoiceFilters(q, contract),
    );
  }
}
