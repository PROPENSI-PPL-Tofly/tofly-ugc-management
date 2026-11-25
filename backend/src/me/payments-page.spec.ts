import { isPaymentsPage } from '../auth/payments-page.decorator.js';
import { MyContentsController } from './my-contents.controller.js';
import { MyInvoicePaymentsController } from './my-invoice-payments.controller.js';
import { MyInvoicesController } from './my-invoices.controller.js';

// PBI-37 (AC 13): "Pembayaran" is the invoice list, its proof and its thread; nothing else.
describe('the routes of Pembayaran', () => {
  it('are the creator invoice routes', () => {
    expect(isPaymentsPage(MyInvoicesController)).toBe(true);
    expect(isPaymentsPage(MyInvoicePaymentsController)).toBe(true);
  });

  it('leave Task Saya out', () => {
    expect(isPaymentsPage(MyContentsController)).toBe(false);
  });
});
