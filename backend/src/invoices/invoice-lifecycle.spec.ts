import { ConflictException } from '@nestjs/common';
import {
  CreatorAckedInvoiceState,
  FinalizedInvoiceState,
  invoiceState,
  type InvoiceLifecycleStatus,
  PaidInvoiceState,
  PaymentUploadedInvoiceState,
  RunningInvoiceState,
} from './invoice-lifecycle.js';

function refusalOf(run: () => void): unknown {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ConflictException);
    return (error as ConflictException).getResponse();
  }
  return expect.unreachable('the state must refuse the operation');
}

const NOT_AWAITING_PROOF = {
  code: 'INVOICE_NOT_AWAITING_PROOF',
  message:
    'Bukti pembayaran hanya bisa diunggah setelah creator meng-acknowledge invoice',
};

describe('RunningInvoiceState', () => {
  it('lets an adjustment and a finalize go on to their business-rule checks', () => {
    const state = new RunningInvoiceState();

    expect(() => state.assertCanAdjust()).not.toThrow();
    expect(() => state.assertCanFinalize()).not.toThrow();
  });

  it('refuses a payment proof: nothing has been finalized or acknowledged yet', () => {
    expect(
      refusalOf(() => new RunningInvoiceState().assertCanUploadProof()),
    ).toEqual(NOT_AWAITING_PROOF);
  });
});

// OWASP Top 10:2025 A08 (Software and Data Integrity Failures): a finalized invoice stays as
// finalized, through every step after it.
describe.each([
  ['FinalizedInvoiceState', () => new FinalizedInvoiceState()],
  ['CreatorAckedInvoiceState', () => new CreatorAckedInvoiceState()],
  ['PaymentUploadedInvoiceState', () => new PaymentUploadedInvoiceState()],
  ['PaidInvoiceState', () => new PaidInvoiceState()],
])('%s', (_name, make) => {
  it.each(['assertCanAdjust', 'assertCanFinalize'] as const)(
    'rejects %s with the INVOICE_FINALIZED conflict',
    (operation) => {
      expect(refusalOf(() => make()[operation]())).toEqual({
        code: 'INVOICE_FINALIZED',
        message: 'Invoice sudah difinalisasi',
      });
    },
  );
});

// OWASP Top 10:2025 A06 (Insecure Design): the proof is taken at exactly one step, after the
// creator accepted the amount and before anyone said it was paid.
describe('assertCanUploadProof', () => {
  it('lets a proof go on once the creator has acknowledged the invoice', () => {
    expect(() =>
      new CreatorAckedInvoiceState().assertCanUploadProof(),
    ).not.toThrow();
  });

  it.each([
    ['finalized, not yet acknowledged', () => new FinalizedInvoiceState()],
    ['already holding a proof', () => new PaymentUploadedInvoiceState()],
    ['already paid', () => new PaidInvoiceState()],
  ])('refuses a proof for an invoice %s', (_case, make) => {
    expect(refusalOf(() => make().assertCanUploadProof())).toEqual(
      NOT_AWAITING_PROOF,
    );
  });
});

describe('invoiceState', () => {
  it.each([
    ['running', RunningInvoiceState],
    ['finalized', FinalizedInvoiceState],
    ['creator_acked', CreatorAckedInvoiceState],
    ['payment_uploaded', PaymentUploadedInvoiceState],
    ['paid', PaidInvoiceState],
  ] as const)('resolves the %s status to its state', (status, State) => {
    expect(invoiceState(status)).toBeInstanceOf(State);
  });

  // OWASP Top 10:2025 A10 (Mishandling of Exceptional Conditions): an unknown status fails closed.
  it('fails closed on a status the lifecycle does not know', () => {
    expect(() => invoiceState('archived' as InvoiceLifecycleStatus)).toThrow(
      'Unsupported invoice status',
    );
  });
});

// The database keeps a running invoice as 'running'; the invoice pipeline and the API call the
// same invoice 'accruing'. Each state says which pipeline status it is, so the word is mapped in
// one place.
describe('pipelineStatus', () => {
  it('reads a running invoice as accruing, the first status of the pipeline', () => {
    expect(invoiceState('running').pipelineStatus).toBe('accruing');
  });

  it.each(['finalized', 'creator_acked', 'payment_uploaded', 'paid'] as const)(
    'reads a %s invoice under the same name',
    (status) => {
      expect(invoiceState(status).pipelineStatus).toBe(status);
    },
  );
});
