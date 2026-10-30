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
  /** The creator accepts the frozen amount (13.1). */
  assertCanAcknowledge(): void;
  /** The creator confirms the payment arrived (13.1). */
  assertCanConfirmReceipt(): void;
  /** A video link is submitted, added for another platform or replaced (PBI-38 AC 8, 9). */
  assertCanChangeLinks(): void;
}

/** Why a proof is refused: the invoice is not waiting for one. */
export function notAwaitingProof(): ConflictException {
  return new ConflictException({
    code: 'INVOICE_NOT_AWAITING_PROOF',
    message:
      'Bukti pembayaran hanya bisa diunggah setelah creator meng-acknowledge invoice',
  });
}

/** Why a move off the flow is refused, each with the step the invoice is missing or past. */
function refused(code: string, message: string): ConflictException {
  return new ConflictException({ code, message });
}

function notFinalized(): ConflictException {
  return refused('INVOICE_NOT_FINALIZED', 'Invoice belum difinalisasi');
}

function alreadyAcknowledged(): ConflictException {
  return refused(
    'INVOICE_ALREADY_ACKNOWLEDGED',
    'Invoice sudah di-acknowledge',
  );
}

function proofNotUploaded(): ConflictException {
  return refused(
    'PAYMENT_PROOF_NOT_UPLOADED',
    'Bukti pembayaran belum diunggah',
  );
}

function alreadyPaid(): ConflictException {
  return refused('INVOICE_ALREADY_PAID', 'Invoice sudah dibayar');
}

export class RunningInvoiceState implements InvoiceState {
  readonly pipelineStatus = 'accruing';

  assertCanAdjust(): void {}

  assertCanFinalize(): void {}

  assertCanUploadProof(): never {
    throw notAwaitingProof();
  }

  assertCanAcknowledge(): never {
    throw notFinalized();
  }

  assertCanConfirmReceipt(): never {
    throw proofNotUploaded();
  }

  assertCanChangeLinks(): void {}
}

/**
 * Every step from finalizing on: the snapshot is frozen, so nothing is adjusted or finalized
 * again. A payment proof, an acknowledge and a receipt confirmation are refused unless a step
 * says otherwise; past finalizing, the creator has already acknowledged.
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

  assertCanAcknowledge(): void {
    throw alreadyAcknowledged();
  }

  assertCanConfirmReceipt(): void {
    throw proofNotUploaded();
  }

  /** The bonus was read from these links: changing one now would pay for a video nobody counted. */
  assertCanChangeLinks(): never {
    throw refused(
      'INVOICE_FINALIZED',
      'Invoice sudah difinalisasi. Link video tidak bisa diubah lagi',
    );
  }

  private finalized(): ConflictException {
    return new ConflictException({
      code: 'INVOICE_FINALIZED',
      message: 'Invoice sudah difinalisasi',
    });
  }
}

/** The amount is frozen; the creator's acknowledge is what comes next. */
export class FinalizedInvoiceState extends FrozenInvoiceState {
  readonly pipelineStatus = 'finalized';

  override assertCanAcknowledge(): void {}
}

/** The creator accepted the amount; the admin's payment proof is what comes next. */
export class CreatorAckedInvoiceState extends FrozenInvoiceState {
  readonly pipelineStatus = 'creator_acked';

  override assertCanUploadProof(): void {}
}

/** The admin sent the proof; the creator's receipt confirmation is what comes next. */
export class PaymentUploadedInvoiceState extends FrozenInvoiceState {
  readonly pipelineStatus = 'payment_uploaded';

  override assertCanConfirmReceipt(): void {}
}

/** The last step: nothing moves a paid invoice again. */
export class PaidInvoiceState extends FrozenInvoiceState {
  readonly pipelineStatus = 'paid';

  override assertCanAcknowledge(): never {
    throw alreadyPaid();
  }

  override assertCanConfirmReceipt(): never {
    throw alreadyPaid();
  }
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
