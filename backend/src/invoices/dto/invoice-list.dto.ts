import type {
  ComponentStatus,
  InvoiceComponentKey,
  InvoiceLine,
} from '../invoice-component.js';
import type { InvoiceStatus } from '../invoice-status.js';
import type { RateFormula } from '../rate-formula.js';

/** One part of the invoice as the Rate & Invoicing table reads it. */
export interface InvoiceComponentDto {
  /** Rupiah, always zero or more; null while the component is waiting for data. */
  amount: number | null;
  status: ComponentStatus;
  lines: InvoiceLine[];
}

export interface InvoiceContractDto {
  id: string;
  status: 'active' | 'expired' | 'upcoming';
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD */
  endDate: string;
}

/** What the calculation answers for one creator, before the pipeline says where it stands. */
export interface CalculatedInvoice {
  creatorId: string;
  creatorName: string;
  contract: InvoiceContractDto;
  components: Record<InvoiceComponentKey, InvoiceComponentDto>;
  /** What the components add up to, which may be below zero. */
  rawTotal: number;
  /** The amount owed, never below zero. */
  total: number;
  /** Whether the penalty outweighed the pay and the total was held at zero. */
  floored: boolean;
}

export interface InvoiceListItem extends CalculatedInvoice {
  /** Where the invoice stands in its pipeline; 'accruing' until it can be finalized. */
  invoiceStatus: InvoiceStatus;
}

/**
 * One creator's invoice with what its breakdown popups state beside the amounts: which contract
 * period it pays (1 for the first contract, counting up with each renewal) and the formula it
 * was worked out with, null while no admin has saved one.
 */
export interface InvoiceDetail extends InvoiceListItem {
  periodNumber: number;
  formula: RateFormula | null;
}

/** What the page says about every invoice, not only the ones on the page. */
export interface InvoiceListSummary {
  /** What every invoice the filters keep adds up to, across all pages. */
  total: number;
  /** Running invoices across the whole roster, whatever the filters: what a formula change reaches. */
  runningInvoices: number;
  /** Whether an admin has saved a rate formula yet. */
  formulaSet: boolean;
}

export interface InvoiceListResponse {
  items: InvoiceListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  summary: InvoiceListSummary;
}
