import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard, type AdminRequest } from '../auth/admin.guard.js';
import { unauthenticated } from '../auth/creator-request.js';
import { checkPaging, DEFAULT_PAGE_SIZE } from '../creators/paging.js';
import type {
  InvoiceDetail,
  InvoiceListResponse,
} from './dto/invoice-list.dto.js';
import { checkInvoiceFilters } from './invoice-filters.js';
import { checkInvoiceSort } from './invoice-sort.js';
import {
  InvoicesService,
  type InvoiceDetailReader,
  type InvoiceLister,
} from './invoices.service.js';
import { checkFinalizeRequest } from './finalize-request.js';
import { checkManualAdjustment } from './manual-adjustment.js';

@Controller('invoices')
@UseGuards(AdminGuard)
export class InvoicesController {
  constructor(
    @Inject(InvoicesService)
    private readonly invoices: InvoiceLister &
      InvoiceDetailReader &
      Pick<InvoicesService, 'addAdjustment' | 'finalize'>,
  ) {}

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

  @Post(':contractId/adjustments')
  async addAdjustment(
    @Param('contractId', new ParseUUIDPipe()) contractId: string,
    @Body() body: unknown,
    @Req() request: Pick<AdminRequest, 'principal'>,
  ) {
    if (request.principal?.role !== 'admin') throw unauthenticated();

    return this.invoices.addAdjustment(
      contractId,
      checkManualAdjustment(body),
      request.principal.userId,
    );
  }

  @Post(':contractId/finalize')
  async finalize(
    @Param('contractId', new ParseUUIDPipe()) contractId: string,
    @Body() body: unknown,
    @Req() request: Pick<AdminRequest, 'principal'>,
  ) {
    if (request.principal?.role !== 'admin') throw unauthenticated();

    return this.invoices.finalize(
      contractId,
      new Date(),
      checkFinalizeRequest(body),
    );
  }
}