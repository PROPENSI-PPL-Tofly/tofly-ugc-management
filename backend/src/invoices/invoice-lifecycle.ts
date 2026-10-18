import { ConflictException } from '@nestjs/common';

export type InvoiceStatus = 'running' | 'finalized';

/** Lifecycle policy resolved from the status read from the database. */
export interface InvoiceState {
  assertCanAdjust(): void;
  assertCanFinalize(): void;
}

export class RunningInvoiceState implements InvoiceState {
  assertCanAdjust(): void {}

  assertCanFinalize(): void {}
}

export class FinalizedInvoiceState implements InvoiceState {
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

export function invoiceState(status: InvoiceStatus): InvoiceState {
  switch (status) {
    case 'running':
      return new RunningInvoiceState();
    case 'finalized':
      return new FinalizedInvoiceState();
    default:
      throw new Error('Unsupported invoice status');
  }
}
