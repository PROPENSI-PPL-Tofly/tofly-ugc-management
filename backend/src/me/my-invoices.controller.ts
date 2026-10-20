import {
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentCreator } from '../auth/current-creator.decorator.js';
import { DevCreatorGuard } from '../auth/dev-creator.guard.js';
import type {
  AcknowledgedInvoiceDto,
  PaidInvoiceDto,
} from '../invoices/dto/invoice-confirmation.dto.js';
import { InvoiceConfirmationService } from '../invoices/invoice-confirmation.service.js';
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

  @Post(':contractId/confirm-receipt')
  async confirmReceipt(
    @CurrentCreator() creatorId: string,
    @Param('contractId', new ParseUUIDPipe()) contractId: string,
  ): Promise<PaidInvoiceDto> {
    return this.confirmations.confirmReceipt(contractId, creatorId);
  }
}
