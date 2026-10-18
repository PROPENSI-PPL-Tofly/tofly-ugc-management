import {
  INVOICE_STATUSES,
  RunningInvoiceStatusSource,
} from './invoice-status.js';

describe('INVOICE_STATUSES', () => {
  it('walks the invoice pipeline in order, starting from a running invoice', () => {
    expect(INVOICE_STATUSES).toEqual([
      'accruing',
      'finalized',
      'creator_acked',
      'payment_uploaded',
      'paid',
    ]);
  });
});

describe('RunningInvoiceStatusSource', () => {
  const source = new RunningInvoiceStatusSource();

  it('reads every contract as running while nothing can finalize an invoice yet', async () => {
    const statuses = await source.statuses(['contract-1', 'contract-2']);

    expect(statuses.get('contract-1')).toBe('accruing');
    expect(statuses.get('contract-2')).toBe('accruing');
    expect(statuses.size).toBe(2);
  });

  it('answers an empty map for no contracts', async () => {
    await expect(source.statuses([])).resolves.toEqual(new Map());
  });
});
