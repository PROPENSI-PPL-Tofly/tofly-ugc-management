import { ConflictException } from '@nestjs/common';
import type { InvoiceStatus } from './invoice-status.js';

/**
 * An invoice's lifecycle as the database keeps it in invoices.status. The pipeline and the API
 * call a running invoice accruing; see InvoiceState.pipelineStatus.
 */
export type InvoiceLifecycleStatus =
  'running' | 'finalized' | 'creator_acked' | 'payment_uploaded' | 'paid';

/** Lifecycle policy resolved from the status read from the database (State pattern). */
export interface InvoiceState {
  /** Where this invoice stands in the invoice pipeline the API reports. */
  readonly pipelineStatus: InvoiceStatus;

  assertCanAdjust(): void;
  assertCanFinalize(): void;
  assertCanUploadProof(): void;
}

/** Why a proof is refused: the invoice is not waiting for one. */
export function notAwaitingProof(): ConflictException {
  return new ConflictException({
    code: 'INVOICE_NOT_AWAITING_PROOF',
    message:
      'Bukti pembayaran hanya bisa diunggah setelah creator meng-acknowledge invoice',
  });
}

export class RunningInvoiceState implements InvoiceState {
  readonly pipelineStatus = 'accruing';

  assertCanAdjust(): void {}

  assertCanFinalize(): void {}

  assertCanUploadProof(): never {
    throw notAwaitingProof();
  }
}

/**
 * Every step from finalizing on: the snapshot is frozen, so nothing is adjusted or finalized
 * again, and a payment proof is refused unless a step says otherwise.
 */
abstract class FrozenInvoiceState implements InvoiceState {
  abstract readonly pipelineStatus: InvoiceStatus;

  assertCanAdjust(): never {
    throw this.finalized();
  }

  assertCanFinalize(): never {
    throw this.finalized();
  }

  assertCanUploadProof(): void {
    throw notAwaitingProof();
  }

  private finalized(): ConflictException {
    return new ConflictException({
      code: 'INVOICE_FINALIZED',
      message: 'Invoice sudah difinalisasi',
    });
  }
}

export class FinalizedInvoiceState extends FrozenInvoiceState {
  readonly pipelineStatus = 'finalized';
}

/** The creator accepted the amount; the admin's payment proof is what comes next. */
export class CreatorAckedInvoiceState extends FrozenInvoiceState {
  readonly pipelineStatus = 'creator_acked';

  override assertCanUploadProof(): void {}
}

export class PaymentUploadedInvoiceState extends FrozenInvoiceState {
  readonly pipelineStatus = 'payment_uploaded';
}

export class PaidInvoiceState extends FrozenInvoiceState {
  readonly pipelineStatus = 'paid';
}

export function invoiceState(status: InvoiceLifecycleStatus): InvoiceState {
  switch (status) {
    case 'running':
      return new RunningInvoiceState();
    case 'finalized':
      return new FinalizedInvoiceState();
    case 'creator_acked':
      return new CreatorAckedInvoiceState();
    case 'payment_uploaded':
      return new PaymentUploadedInvoiceState();
    case 'paid':
      return new PaidInvoiceState();
    default:
      throw new Error('Unsupported invoice status');
  }
}
