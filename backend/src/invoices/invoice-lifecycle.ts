import { ConflictException } from '@nestjs/common';
import type { InvoiceStatus } from './invoice-status.js';

/**
 * An invoice's lifecycle as the database keeps it in invoices.status. The pipeline and the API
 * call a running invoice accruing; see InvoiceState.pipelineStatus.
 */
export type InvoiceLifecycleStatus = 'running' | 'finalized';

/** Lifecycle policy resolved from the status read from the database. */
export interface InvoiceState {
  /** Where this invoice stands in the invoice pipeline the API reports. */
  readonly pipelineStatus: InvoiceStatus;

  assertCanAdjust(): void;
  assertCanFinalize(): void;
}

export class RunningInvoiceState implements InvoiceState {
  readonly pipelineStatus = 'accruing';

  assertCanAdjust(): void {}

  assertCanFinalize(): void {}
}

export class FinalizedInvoiceState implements InvoiceState {
  readonly pipelineStatus = 'finalized';

  assertCanAdjust(): never {
    throw this.finalized();
  }

  assertCanFinalize(): never {
    throw this.finalized();
  }

  private finalized(): ConflictException {
    return new ConflictException({
      code: 'INVOICE_FINALIZED',
      message: 'Invoice sudah difinalisasi',
    });
  }
}

export function invoiceState(status: InvoiceLifecycleStatus): InvoiceState {
  switch (status) {
    case 'running':
      return new RunningInvoiceState();
    case 'finalized':
      return new FinalizedInvoiceState();
    default:
      throw new Error('Unsupported invoice status');
  }
}
