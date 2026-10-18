import { ConflictException } from '@nestjs/common';
import {
  FinalizedInvoiceState,
  invoiceState,
  type InvoiceStatus,
  RunningInvoiceState,
} from './invoice-lifecycle.js';

describe('RunningInvoiceState', () => {
  it('lets an adjustment and a finalize go on to their business-rule checks', () => {
    const state = new RunningInvoiceState();

    expect(() => state.assertCanAdjust()).not.toThrow();
    expect(() => state.assertCanFinalize()).not.toThrow();
  });
});

// OWASP Top 10:2025 A08 (Software and Data Integrity Failures): a finalized invoice stays as finalized.
describe('FinalizedInvoiceState', () => {
  it.each(['assertCanAdjust', 'assertCanFinalize'] as const)(
    'rejects %s with the INVOICE_FINALIZED conflict',
    (operation) => {
      const state = new FinalizedInvoiceState();

      try {
        state[operation]();
        expect.unreachable('a finalized invoice must reject the operation');
      } catch (error) {
        expect(error).toBeInstanceOf(ConflictException);
        expect((error as ConflictException).getResponse()).toEqual({
          code: 'INVOICE_FINALIZED',
          message: 'Invoice sudah difinalisasi',
        });
      }
    },
  );
});

describe('invoiceState', () => {
  it('resolves the running state from the persisted running status', () => {
    expect(invoiceState('running')).toBeInstanceOf(RunningInvoiceState);
  });

  it('resolves the finalized state from the persisted finalized status', () => {
    expect(invoiceState('finalized')).toBeInstanceOf(FinalizedInvoiceState);
  });

  // OWASP Top 10:2025 A10 (Mishandling of Exceptional Conditions): an unknown status fails closed.
  it('fails closed on a status the lifecycle does not know', () => {
    expect(() => invoiceState('paid' as InvoiceStatus)).toThrow(
      'Unsupported invoice status',
    );
  });
});
