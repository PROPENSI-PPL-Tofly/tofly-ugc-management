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

export interface InvoiceAdjustmentDto {
  id: string;
  amount: number;
  reason: string;
  actorId: string;
  createdAt: string;
}

export interface InvoiceSnapshotDto {
  fixedRate: InvoiceComponentDto;
  additionalContent: InvoiceComponentDto;
  performanceBonus: InvoiceComponentDto;
  penalty: InvoiceComponentDto;
  adjustments: InvoiceAdjustmentDto[];
  rawTotal: number;
  total: number;
  floored: boolean;
  finalizedAt: string;
  /**
   * The formula the breakdown was calculated with, null if none was saved then. Absent from a
   * snapshot saved before the formula was kept with it.
   */
  formula?: RateFormula | null;
}

/** Calculation result before the invoice pipeline assigns its status. */
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
  /** Where the invoice stands in the invoice pipeline. */
  invoiceStatus: InvoiceStatus;
  /** Manual adjustments recorded against this invoice. */
  adjustments: InvoiceAdjustmentDto[];
  /** Persisted breakdown and totals after finalization; null while not finalized. */
  snapshot: InvoiceSnapshotDto | null;
}

/**
 * One creator's invoice with the contract period and formula used for its calculation.
 */
export interface InvoiceDetail extends InvoiceListItem {
  periodNumber: number;
  /**
   * The current formula while the invoice is calculated live; once finalized, the one saved with
   * its snapshot, or null when that snapshot predates keeping it.
   */
  formula: RateFormula | null;
}

/** Summary information across all invoices kept by the filters. */
export interface InvoiceListSummary {
  /** What every invoice the filters keep adds up to, across all pages. */
  total: number;
  /** Running invoices across the whole roster, whatever the filters. */
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