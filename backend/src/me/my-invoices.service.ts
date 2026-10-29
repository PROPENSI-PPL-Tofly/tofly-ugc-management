import { Inject, Injectable } from '@nestjs/common';
import type {
  InvoiceAdjustmentDto,
  InvoiceSnapshotDto,
  InvoiceView,
} from '../invoices/dto/invoice-list.dto.js';
import type {
  InvoiceCommentDto,
  InvoicePaymentFields,
} from '../invoices/dto/invoice-payment.dto.js';
import {
  InvoiceCommentsService,
  type InvoiceCommentReader,
} from '../invoices/invoice-comments.service.js';
import { InvoicesService } from '../invoices/invoices.service.js';
import {
  PaymentProofService,
  type PaymentProofReader,
} from '../invoices/payment-proof.service.js';

// The creator's Pembayaran page (PBI-13): GET /me/invoices answers every invoice of the signed-in
// creator with its status, the breakdown or its frozen snapshot (PBI-12), the proof link once
// uploaded and the comment thread (13.1). The creator reads the same numbers the admin froze.

/** An adjustment as the creator reads it: what and why, not which admin recorded it. */
export type CreatorAdjustmentDto = Omit<InvoiceAdjustmentDto, 'actorId'>;

export type CreatorSnapshotDto = Omit<InvoiceSnapshotDto, 'adjustments'> & {
  adjustments: CreatorAdjustmentDto[];
};

/** One of the creator's invoices, under the names the admin's detail uses. */
export type CreatorInvoiceDto = Omit<InvoiceView, 'adjustments' | 'snapshot'> &
  InvoicePaymentFields & {
    adjustments: CreatorAdjustmentDto[];
    snapshot: CreatorSnapshotDto | null;
    /** Oldest first. */
    comments: InvoiceCommentDto[];
  };

export interface CreatorInvoicesResponse {
  items: CreatorInvoiceDto[];
}

/** Named field by field, so a field added on the admin's side is not shown to the creator. */
function forCreator({
  id,
  amount,
  reason,
  createdAt,
}: InvoiceAdjustmentDto): CreatorAdjustmentDto {
  return { id, amount, reason, createdAt };
}

@Injectable()
export class MyInvoicesService {
  constructor(
    @Inject(InvoicesService)
    private readonly invoices: Pick<InvoicesService, 'forCreator'>,
    @Inject(PaymentProofService) private readonly proofs: PaymentProofReader,
    @Inject(InvoiceCommentsService)
    private readonly comments: InvoiceCommentReader,
  ) {}

  /** Newest period first; the proofs and the threads are read once for every invoice. */
  async list(
    creatorId: string,
    today = new Date(),
  ): Promise<CreatorInvoicesResponse> {
    const views = await this.invoices.forCreator(creatorId, today);
    const ids = views.map(({ contract }) => contract.id);

    const [proofs, threads] = await Promise.all([
      // The creator's own route to the file: the admin's would send them into AdminGuard.
      this.proofs.forContracts(ids, 'creator'),
      this.comments.forContracts(ids),
    ]);

    return {
      items: views.map((view) => ({
        ...view,
        adjustments: view.adjustments.map(forCreator),
        snapshot: view.snapshot && {
          ...view.snapshot,
          adjustments: view.snapshot.adjustments.map(forCreator),
        },
        paymentProof: proofs.get(view.contract.id) ?? null,
        comments: threads.get(view.contract.id) ?? [],
      })),
    };
  }
}
