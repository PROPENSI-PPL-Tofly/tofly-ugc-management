import { ConflictException } from '@nestjs/common';
import {
  FinalizedInvoiceState,
  invoiceState,
  type InvoiceLifecycleStatus,
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

const FINALIZED = {
  code: 'INVOICE_FINALIZED',
  message: 'Invoice sudah difinalisasi',
};
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

  it('lets a video link be submitted, added or replaced (PBI-38 AC 8, 9)', () => {
    expect(() =>
      new RunningInvoiceState().assertCanChangeLinks(),
    ).not.toThrow();
  });
});

// PBI-38 AC 8, 9: the links an invoice was calculated from stay as they were once it is frozen.
describe.each([
  'finalized',
  'creator_acked',
  'payment_uploaded',
  'paid',
] as const)('the video links of a contract whose invoice is %s', (status) => {
  it('can no longer be submitted, added or replaced', () => {
    expect(
      refusalOf(() => invoiceState(status).assertCanChangeLinks()),
    ).toEqual({
      code: 'INVOICE_FINALIZED',
      message: 'Invoice sudah difinalisasi. Link video tidak bisa diubah lagi',
    });
  });
});

// OWASP Top 10:2025 A08 (Software and Data Integrity Failures): once finalized, an invoice stays
// frozen through every later step.
describe.each([
  'finalized',
  'creator_acked',
  'payment_uploaded',
  'paid',
] as const)('a %s invoice', (status) => {
  it('refuses an adjustment and a second finalize', () => {
    const state = invoiceState(status);

    expect(refusalOf(() => state.assertCanAdjust())).toEqual(FINALIZED);
    expect(refusalOf(() => state.assertCanFinalize())).toEqual(FINALIZED);
  });

  it('is reported under its own pipeline name', () => {
    expect(invoiceState(status).pipelineStatus).toBe(status);
  });
});

// OWASP Top 10:2025 A06 (Insecure Design): the proof is taken at exactly one step, after the
// creator accepted the amount and before anyone said it was paid.
describe('assertCanUploadProof', () => {
  it('lets a proof in once the creator has acknowledged', () => {
    expect(() =>
      invoiceState('creator_acked').assertCanUploadProof(),
    ).not.toThrow();
  });

  it.each(['running', 'finalized', 'payment_uploaded', 'paid'] as const)(
    'refuses a proof for a %s invoice',
    (status) => {
      expect(
        refusalOf(() => invoiceState(status).assertCanUploadProof()),
      ).toEqual(NOT_AWAITING_PROOF);
    },
  );
});

const NOT_FINALIZED = {
  code: 'INVOICE_NOT_FINALIZED',
  message: 'Invoice belum difinalisasi',
};
const ALREADY_ACKNOWLEDGED = {
  code: 'INVOICE_ALREADY_ACKNOWLEDGED',
  message: 'Invoice sudah di-acknowledge',
};
const PROOF_NOT_UPLOADED = {
  code: 'PAYMENT_PROOF_NOT_UPLOADED',
  message: 'Bukti pembayaran belum diunggah',
};
const ALREADY_PAID = {
  code: 'INVOICE_ALREADY_PAID',
  message: 'Invoice sudah dibayar',
};

// OWASP Top 10:2025 A06 (Insecure Design): the creator acknowledges once, and only the amount
// the admin froze. Every other step says why it cannot.
describe('assertCanAcknowledge', () => {
  it('lets a finalized invoice be acknowledged', () => {
    expect(() =>
      invoiceState('finalized').assertCanAcknowledge(),
    ).not.toThrow();
  });

  it.each([
    ['running', NOT_FINALIZED],
    ['creator_acked', ALREADY_ACKNOWLEDGED],
    ['payment_uploaded', ALREADY_ACKNOWLEDGED],
    ['paid', ALREADY_PAID],
  ] as const)('refuses a %s invoice with its reason', (status, reason) => {
    expect(
      refusalOf(() => invoiceState(status).assertCanAcknowledge()),
    ).toEqual(reason);
  });
});

// OWASP Top 10:2025 A06 (Insecure Design): receipt is confirmed only against a proof the admin
// uploaded, and only once.
describe('assertCanConfirmReceipt', () => {
  it('lets an invoice with an uploaded proof be confirmed', () => {
    expect(() =>
      invoiceState('payment_uploaded').assertCanConfirmReceipt(),
    ).not.toThrow();
  });

  it.each([
    ['running', PROOF_NOT_UPLOADED],
    ['finalized', PROOF_NOT_UPLOADED],
    ['creator_acked', PROOF_NOT_UPLOADED],
    ['paid', ALREADY_PAID],
  ] as const)('refuses a %s invoice with its reason', (status, reason) => {
    expect(
      refusalOf(() => invoiceState(status).assertCanConfirmReceipt()),
    ).toEqual(reason);
  });
});

describe('invoiceState', () => {
  it('reads a running invoice as accruing, the first status of the pipeline', () => {
    expect(invoiceState('running')).toBeInstanceOf(RunningInvoiceState);
    expect(invoiceState('running').pipelineStatus).toBe('accruing');
    expect(invoiceState('finalized')).toBeInstanceOf(FinalizedInvoiceState);
  });

  // OWASP Top 10:2025 A10 (Mishandling of Exceptional Conditions): an unknown status fails closed.
  it('fails closed on a status the lifecycle does not know', () => {
    expect(() => invoiceState('archived' as InvoiceLifecycleStatus)).toThrow(
      'Unsupported invoice status',
    );
  });
});
