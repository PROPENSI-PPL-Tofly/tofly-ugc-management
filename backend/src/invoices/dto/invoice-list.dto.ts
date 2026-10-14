import type {
  ComponentStatus,
  InvoiceComponentKey,
  InvoiceLine,
} from '../invoice-component.js';

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

export interface InvoiceListItem {
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

export interface InvoiceListResponse {
  items: InvoiceListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
