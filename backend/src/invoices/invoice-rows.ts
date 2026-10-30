// From database rows to the calculator's plain inputs and back out to the table's item. Kept
// apart from the service so the mapping is tested on plain objects, without Nest or a mock
// database, and the service is left with loading rows and paging.

import { Prisma } from '@prisma/client';
import { jakartaDay } from '../creators/evergreen.js';
import {
  contractStatus,
  currentContract,
  type MetricsContract,
} from '../creators/creator-metrics.js';
import type {
  InvoiceAdjustmentDto,
  InvoiceListItem,
  InvoiceSnapshotDto,
} from './dto/invoice-list.dto.js';
import { calculateInvoice } from './invoice-calculator.js';
import { contractLastDay } from './invoice-days.js';
import type { InvoiceContractStatus } from './invoice-filters.js';
import type { InvoiceContent, InvoiceContract } from './invoice-component.js';
import type { RateFormula } from './rate-formula.js';

/**
 * Only the columns an invoice is calculated from. Content is loaded afterwards
 * for the one contract per creator the table describes.
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
  // The first link's platform is the one its performance bonus is judged on, as the single
  // link's was before PBI-38.
  content_links: {
    orderBy: [{ submitted_at: 'asc' }, { created_at: 'asc' }],
    take: 1,
    select: { platform: true },
  },
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

/** Postgres date columns arrive as midnight UTC; the first ten ISO characters are the day. */
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
    platform: row.content_links[0]?.platform ?? null,
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

/**
 * Where a contract stands today, as the table's contract column, its filter and the needs-action
 * order read it. An early end counts: past the day access was revoked, the contract has ended,
 * the same last day finalizing waits for.
 */
export function invoiceContractStatus(
  contract: InvoiceContractRow,
  today: Date,
  endedEarlyOn: Date | null = null,
): InvoiceContractStatus {
  // A contract exists, so contractStatus never answers 'none' here.
  const status = contractStatus(period(contract), today) as InvoiceContractStatus;
  if (status !== 'active') return status;

  const lastDay = contractLastDay(toInvoiceContract(contract, endedEarlyOn));
  return jakartaDay(today) > lastDay ? 'expired' : 'active';
}

/**
 * The contract the table describes: the one running today, else the most recently finished,
 * else the earliest upcoming. Null for a creator with no contract at all.
 */
export function pickContract(
  row: InvoiceCreatorRow,
  today: Date,
): InvoiceContractRow | null {
  const picked = currentContract(row.contracts.map(period), today);
  return row.contracts.find((contract) => contract.id === picked?.id) ?? null;
}

/**
 * The contracts a creator's invoices are listed for: the one the table describes first, then
 * every earlier one that has ended. A renewed creator still has the earlier invoice to finalize
 * and pay; the service drops it again once it is paid, and orders every row (invoice-sort).
 */
export function listedContracts(
  row: InvoiceCreatorRow,
  today: Date,
): InvoiceContractRow[] {
  const current = pickContract(row, today);
  if (!current) return [];

  const ended = row.contracts.filter(
    (contract) =>
      contract.id !== current.id &&
      invoiceContractStatus(contract, today, row.access_revoke_date) ===
        'expired',
  );

  return [current, ...ended];
}

/** Which of the creator's contracts this is, counted from 1 in the order they started. */
export function periodNumber(
  row: InvoiceCreatorRow,
  contractRow: InvoiceContractRow,
): number {
  return (
    1 +
    row.contracts.filter(
      (other) => other.start_date < contractRow.start_date,
    ).length
  );
}

/** An adjustment's columns as the API answers them, for the reads and for finalizing. */
export const INVOICE_ADJUSTMENT_SELECT = {
  id: true,
  amount: true,
  reason: true,
  actor_user_id: true,
  created_at: true,
} satisfies Prisma.invoice_adjustmentsSelect;

export function adjustmentDto(row: {
  id: string;
  amount: Prisma.Decimal;
  reason: string;
  actor_user_id: string;
  created_at: Date;
}): InvoiceAdjustmentDto {
  return {
    id: row.id,
    amount: row.amount.toNumber(),
    reason: row.reason,
    actorId: row.actor_user_id,
    createdAt: row.created_at.toISOString(),
  };
}

/** What the manual adjustments add up to, as a decimal so amounts never drift. */
export function sumAdjustments(
  adjustments: readonly InvoiceAdjustmentDto[],
): Prisma.Decimal {
  return adjustments.reduce(
    (sum, adjustment) => sum.plus(adjustment.amount),
    new Prisma.Decimal(0),
  );
}

/**
 * The calculated total plus the adjustments' decimal sum, floored at zero. Numbers are
 * returned only for the DTO and snapshot.
 */
export function adjustedTotals(
  calculatedRawTotal: number,
  adjustmentTotal: Prisma.Decimal,
): { rawTotal: number; total: number; floored: boolean } {
  const raw = new Prisma.Decimal(calculatedRawTotal).plus(adjustmentTotal);

  const floored = raw.lessThan(0);

  return {
    rawTotal: raw.toNumber(),
    total: floored ? 0 : raw.toNumber(),
    floored,
  };
}

const SNAPSHOT_COMPONENTS = [
  'fixedRate',
  'additionalContent',
  'performanceBonus',
  'penalty',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isComponent(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.amount === null || typeof value.amount === 'number') &&
    typeof value.status === 'string' &&
    Array.isArray(value.lines)
  );
}

function isSnapshot(value: unknown): value is InvoiceSnapshotDto {
  return (
    isRecord(value) &&
    SNAPSHOT_COMPONENTS.every((key) => isComponent(value[key])) &&
    Array.isArray(value.adjustments) &&
    typeof value.rawTotal === 'number' &&
    typeof value.total === 'number' &&
    typeof value.floored === 'boolean' &&
    typeof value.finalizedAt === 'string' &&
    (value.formula === undefined ||
      value.formula === null ||
      isRecord(value.formula))
  );
}

/**
 * The snapshot saved in invoices.snapshot, or null when there is none or it does not hold the
 * whole final breakdown and totals; the invoice is then calculated live, as before finalizing.
 */
export function savedSnapshot(
  value: Prisma.JsonValue | null,
): InvoiceSnapshotDto | null {
  return isSnapshot(value) ? value : null;
}

/** What the invoices table holds for an invoice besides where it stands in the pipeline. */
export interface SavedInvoice {
  adjustments: InvoiceAdjustmentDto[];
  /**
   * What every adjustment adds up to, when the database summed them and `adjustments` does not
   * list them all; summed from `adjustments` when absent or null (a sum over no rows).
   */
  adjustmentTotal?: Prisma.Decimal | null;
  snapshot: InvoiceSnapshotDto | null;
}

/** A listed invoice before the InvoiceStatusSource says where it stands. */
export type InvoiceItem = Omit<InvoiceListItem, 'invoiceStatus'>;

/** The invoice of contractRow, using either its live calculation or its persisted snapshot. */
export function toInvoiceItem(
  row: InvoiceCreatorRow,
  contractRow: InvoiceContractRow,
  contents: readonly InvoiceContentRow[],
  formula: RateFormula | null,
  today: Date,
  saved?: SavedInvoice,
): InvoiceItem {
  // An invoice nobody has adjusted or finalized has no saved row yet.
  const lifecycle = saved ?? { adjustments: [], snapshot: null };
  const snapshot = lifecycle.snapshot;

  const contract = toInvoiceContract(contractRow, row.access_revoke_date);
  const breakdown = snapshot
    ? null
    : calculateInvoice({
      contract,
      contents: contents.map(toInvoiceContent),
      formula,
      today,
    });

  const totals =
    snapshot ??
    adjustedTotals(
      breakdown!.rawTotal,
      lifecycle.adjustmentTotal ?? sumAdjustments(lifecycle.adjustments),
    );

  return {
    creatorId: row.id,
    creatorName: creatorName(row),
    adjustments: lifecycle.adjustments,
    snapshot,
    contract: {
      id: contractRow.id,
      status: invoiceContractStatus(contractRow, today, row.access_revoke_date),
      startDate: calendarDay(contractRow.start_date),
      endDate: calendarDay(contractRow.end_date),
      lastDay: contractLastDay(contract),
      period: periodNumber(row, contractRow),
    },
    components: snapshot
      ? {
        fixedRate: snapshot.fixedRate,
        additionalContent: snapshot.additionalContent,
        performanceBonus: snapshot.performanceBonus,
        penalty: snapshot.penalty,
      }
      : breakdown!.components,
    rawTotal: totals.rawTotal,
    total: totals.total,
    floored: totals.floored,
  };
}