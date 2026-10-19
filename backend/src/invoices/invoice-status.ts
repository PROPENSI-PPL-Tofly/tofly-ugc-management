// Where an invoice stands in its pipeline (accruing → finalized → acknowledged → proof uploaded →
// paid). The service reads the status through the InvoiceStatusSource port only, so whatever
// provider invoices.module.ts plugs in is the one authority for the listing, the filter and the
// detail. PersistedInvoiceStatusSource reads it from the saved invoice lifecycle (PBI-12).
//
// 'accruing' is the pipeline's and the API's word for an invoice the database keeps as
// 'running' (invoice-lifecycle.ts); each lifecycle state names its pipeline status.

/** The pipeline in the order an invoice walks it. */
export const INVOICE_STATUSES = [
  'accruing',
  'finalized',
  'creator_acked',
  'payment_uploaded',
  'paid',
] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** The status of each contract's invoice, read for many contracts at once. */
export interface InvoiceStatusSource {
  statuses(
    contractIds: readonly string[],
  ): Promise<ReadonlyMap<string, InvoiceStatus>>;
}

/** Nest injection token for InvoiceStatusSource, since an interface does not exist at runtime. */
export const INVOICE_STATUS_SOURCE = Symbol('INVOICE_STATUS_SOURCE');
