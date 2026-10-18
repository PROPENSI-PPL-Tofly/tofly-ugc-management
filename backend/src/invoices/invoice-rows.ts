// From database rows to the calculator's plain inputs and back out to the table's item. Kept
// apart from the service so the mapping is tested on plain objects, without Nest or a mock
// database, and the service is left with loading rows and paging.

import type { Prisma } from '@prisma/client';
import {
  contractStatus,
  currentContract,
  type MetricsContract,
} from '../creators/creator-metrics.js';
import type { InvoiceListItem } from './dto/invoice-list.dto.js';
import { calculateInvoice } from './invoice-calculator.js';
import type { InvoiceContractStatus } from './invoice-filters.js';
import type { InvoiceContent, InvoiceContract } from './invoice-component.js';
import type { RateFormula } from './rate-formula.js';

/**
 * Only the columns an invoice is calculated from. Content is left out: it is loaded afterwards
 * for the one contract per creator the table describes (CONTENT_SELECT), not for every contract.
 */
export const INVOICE_SELECT = {
  id: true,
  first_name: true,
  middle_name: true,
  last_name: true,
  access_revoke_date: true,
  contracts: {
    select: {
      id: true,
      start_date: true,
      end_date: true,
      content_quota: true,
      fixed_rate: true,
    },
  },
} satisfies Prisma.creatorsSelect;

/** The content columns an invoice is calculated from, with the contract they belong to. */
export const CONTENT_SELECT = {
  id: true,
  contract_id: true,
  name: true,
  type: true,
  status: true,
  deadline: true,
  video_submitted_at: true,
  platform: true,
  views: true,
  likes: true,
} satisfies Prisma.contentsSelect;

export type InvoiceCreatorRow = Prisma.creatorsGetPayload<{
  select: typeof INVOICE_SELECT;
}>;

export type InvoiceContractRow = InvoiceCreatorRow['contracts'][number];

export type InvoiceContentRow = Prisma.contentsGetPayload<{
  select: typeof CONTENT_SELECT;
}>;

/** Postgres `date` columns arrive as midnight UTC; the first ten ISO characters are the day. */
function calendarDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function creatorName(
  row: Pick<InvoiceCreatorRow, 'first_name' | 'middle_name' | 'last_name'>,
): string {
  return [row.first_name, row.middle_name, row.last_name]
    .filter(Boolean)
    .join(' ');
}

export function toInvoiceContent(row: InvoiceContentRow): InvoiceContent {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    status: row.status,
    deadline: row.deadline,
    videoSubmittedAt: row.video_submitted_at,
    platform: row.platform,
    views: row.views,
    likes: row.likes,
  };
}

export function toInvoiceContract(
  row: InvoiceContractRow,
  accessRevokeDate: Date | null,
): InvoiceContract {
  return {
    id: row.id,
    startDate: row.start_date,
    endDate: row.end_date,
    fixedRate: row.fixed_rate.toNumber(),
    contentQuota: row.content_quota,
    endedEarlyOn: accessRevokeDate,
  };
}

/** A contract as the Creator Database's contract helpers read it; they need no content here. */
function period(contract: InvoiceContractRow): MetricsContract {
  return {
    id: contract.id,
    startDate: contract.start_date,
    endDate: contract.end_date,
    contents: [],
  };
}

/** Where a contract stands today, as the table's contract column and filter read it. */
export function invoiceContractStatus(
  contract: InvoiceContractRow,
  today: Date,
): InvoiceContractStatus {
  // A contract exists, so contractStatus never answers 'none' here.
  return contractStatus(period(contract), today) as InvoiceContractStatus;
}

/**
 * The contract the table describes: the one running today, else the most recently finished,
 * else the earliest upcoming (the same pick as the Creator Database). Null for a creator with no
 * contract at all.
 */
export function pickContract(
  row: InvoiceCreatorRow,
  today: Date,
): InvoiceContractRow | null {
  const picked = currentContract(row.contracts.map(period), today);
  return row.contracts.find((contract) => contract.id === picked?.id) ?? null;
}

/** The invoice of `contractRow`, one of the creator's contracts, from its content. */
export function toInvoiceItem(
  row: InvoiceCreatorRow,
  contractRow: InvoiceContractRow,
  contents: readonly InvoiceContentRow[],
  formula: RateFormula | null,
  today: Date,
): InvoiceListItem {
  const breakdown = calculateInvoice({
    contract: toInvoiceContract(contractRow, row.access_revoke_date),
    contents: contents.map(toInvoiceContent),
    formula,
    today,
  });

  return {
    creatorId: row.id,
    creatorName: creatorName(row),
    contract: {
      id: contractRow.id,
      status: invoiceContractStatus(contractRow, today),
      startDate: calendarDay(contractRow.start_date),
      endDate: calendarDay(contractRow.end_date),
    },
    components: breakdown.components,
    rawTotal: breakdown.rawTotal,
    total: breakdown.total,
    floored: breakdown.floored,
  };
}
