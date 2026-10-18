// Where an invoice stands in its pipeline (running → finalized → acknowledged → proof uploaded →
// paid). Finalizing and paying arrive with PBI-12/13; until then every invoice is running. The
// service reads the status through the InvoiceStatusSource port, so the pipeline plugs in as one
// provider in invoices.module.ts and the listing, the filter and the detail do not change.

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

/** Nothing can finalize an invoice yet, so every invoice is still running. */
export class RunningInvoiceStatusSource implements InvoiceStatusSource {
  statuses(
    contractIds: readonly string[],
  ): Promise<ReadonlyMap<string, InvoiceStatus>> {
    return Promise.resolve(
      new Map(contractIds.map((id) => [id, 'accruing' as const])),
    );
  }
}
