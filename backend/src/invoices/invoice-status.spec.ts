import { INVOICE_STATUSES } from './invoice-status.js';

describe('INVOICE_STATUSES', () => {
  it('walks the invoice pipeline in order, starting from a running invoice', () => {
    expect(INVOICE_STATUSES).toEqual([
      'accruing',
      'finalized',
      'creator_acked',
      'payment_uploaded',
      'paid',
      // PBI-37: off the pipeline, last, so the walk above stays in order.
      'cancelled',
    ]);
  });
});
