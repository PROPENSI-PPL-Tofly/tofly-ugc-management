// What the API answers about the creator's two moves on an invoice (PBI-13, 13.1): the
// acknowledge and the receipt confirmation. The frontends read these names.

/** What POST /me/invoices/:contractId/acknowledge answers. */
export interface AcknowledgedInvoiceDto {
  invoiceStatus: 'creator_acked';
  /** ISO instant. */
  acknowledgedAt: string;
}

/** What POST /me/invoices/:contractId/confirm-receipt answers. */
export interface PaidInvoiceDto {
  invoiceStatus: 'paid';
  /** ISO instant. */
  paidAt: string;
}

/** When the creator made each move, on a Rate & Invoicing row, the detail and GET /me/invoices. */
export interface InvoiceConfirmationFields {
  /** ISO instant the creator acknowledged the invoice, or null before they did. */
  acknowledgedAt: string | null;
  /** ISO instant the creator confirmed the payment arrived, or null before they did. */
  paidAt: string | null;
}
