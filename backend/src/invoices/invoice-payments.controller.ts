import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { AdminGuard, type AdminRequest } from '../auth/admin.guard.js';
import { unauthenticated } from '../auth/creator-request.js';
import { sendOpenedFile } from '../storage/open-file-response.js';
import { checkInvoiceComment } from './comment-request.js';
import type {
  InvoiceCommentDto,
  UploadedPaymentProofDto,
} from './dto/invoice-payment.dto.js';
import { InvoiceCommentsService } from './invoice-comments.service.js';
import { checkPaymentProof, type UploadedProof } from './payment-proof-file.js';
import { PaymentProofService } from './payment-proof.service.js';
import { ProofUploadInterceptor } from './proof-upload.interceptor.js';

/**
 * The admin's side of paying an invoice (PBI-13): uploading the payment proof, opening it, and
 * the invoice's comment thread. Routes are by contract, as the other invoice actions are.
 */
@Controller('invoices')
@UseGuards(AdminGuard)
export class InvoicePaymentsController {
  constructor(
    @Inject(PaymentProofService)
    private readonly proofs: Pick<PaymentProofService, 'upload' | 'open'>,
    @Inject(InvoiceCommentsService)
    private readonly comments: Pick<InvoiceCommentsService, 'list' | 'add'>,
  ) {}

  @Post(':contractId/payment-proof')
  @UseInterceptors(ProofUploadInterceptor)
  async uploadProof(
    @Param('contractId', new ParseUUIDPipe()) contractId: string,
    @UploadedFile() file: UploadedProof | undefined,
    @Req() request: Pick<AdminRequest, 'principal'>,
  ): Promise<UploadedPaymentProofDto> {
    if (request.principal?.role !== 'admin') throw unauthenticated();

    return this.proofs.upload(
      contractId,
      checkPaymentProof(file),
      request.principal.userId,
    );
  }

  @Get(':contractId/payment-proof')
  async openProof(
    @Param('contractId', new ParseUUIDPipe()) contractId: string,
    @Res() res: Response,
  ): Promise<void> {
    sendOpenedFile(res, await this.proofs.open(contractId, {}));
  }

  @Get(':contractId/comments')
  async listComments(
    @Param('contractId', new ParseUUIDPipe()) contractId: string,
  ): Promise<InvoiceCommentDto[]> {
    return this.comments.list(contractId, {});
  }

  @Post(':contractId/comments')
  async addComment(
    @Param('contractId', new ParseUUIDPipe()) contractId: string,
    @Body() body: unknown,
    @Req() request: Pick<AdminRequest, 'principal'>,
  ): Promise<InvoiceCommentDto> {
    if (request.principal?.role !== 'admin') throw unauthenticated();

    return this.comments.add(contractId, checkInvoiceComment(body), {
      role: 'admin',
      userId: request.principal.userId,
    });
  }
}
