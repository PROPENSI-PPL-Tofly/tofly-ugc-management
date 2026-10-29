import {
  Body,
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
import { checkInvoiceComment } from '../invoices/comment-request.js';
import type { InvoiceCommentDto } from '../invoices/dto/invoice-payment.dto.js';
import { InvoiceCommentsService } from '../invoices/invoice-comments.service.js';
import { PaymentProofService } from '../invoices/payment-proof.service.js';
import { sendOpenedFile } from '../storage/open-file-response.js';

/**
 * The creator's side of an invoice's payment (PBI-13): its comment thread and the admin's proof.
 * Every call is scoped by the creator the guard resolved, so another creator's contract answers
 * as a missing one.
 */
@Controller('me/invoices')
@UseGuards(DevCreatorGuard)
export class MyInvoicePaymentsController {
  constructor(
    @Inject(PaymentProofService)
    private readonly proofs: Pick<PaymentProofService, 'open'>,
    @Inject(InvoiceCommentsService)
    private readonly comments: Pick<InvoiceCommentsService, 'list' | 'add'>,
  ) {}

  @Get(':contractId/comments')
  async listComments(
    @CurrentCreator() creatorId: string,
    @Param('contractId', new ParseUUIDPipe()) contractId: string,
  ): Promise<InvoiceCommentDto[]> {
    return this.comments.list(contractId, { creatorId });
  }

  @Post(':contractId/comments')
  async addComment(
    @CurrentCreator() creatorId: string,
    @Param('contractId', new ParseUUIDPipe()) contractId: string,
    @Body() body: unknown,
  ): Promise<InvoiceCommentDto> {
    return this.comments.add(contractId, checkInvoiceComment(body), {
      role: 'creator',
      creatorId,
    });
  }

  @Get(':contractId/payment-proof')
  async openProof(
    @CurrentCreator() creatorId: string,
    @Param('contractId', new ParseUUIDPipe()) contractId: string,
    @Res() res: Response,
  ): Promise<void> {
    sendOpenedFile(res, await this.proofs.open(contractId, { creatorId }));
  }
}
