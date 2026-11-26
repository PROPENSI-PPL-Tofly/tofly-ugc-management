// The "Performa Creator" rows (PBI-24, AC 6): one creator with a contract in the range, with the
// numbers management sorts by. Pure arithmetic over plain rows, shared with the charts' rules.

import { contentOutcome } from '../creators/creator-metrics.js';
import type {
  CreatorRow,
  CreatorSortKey,
} from './dto/executive-dashboard.dto.js';

export interface CreatorInput {
  creatorId: string;
  name: string;
  contract: { quota: number; startDate: string; endDate: string } | null;
}

export interface CreatorInvoiceInput {
  creatorId: string;
  spending: number;
}

export interface CreatorViewInput {
  creatorId: string;
  views: number | null;
  dataState: string;
  platform: string | null;
}

export interface CreatorContentInput {
  creatorId: string;
  deadline: string;
  videoSubmittedAt: string | null;
  isProposal: boolean;
}

const MEASURED = ['synced', 'manual'];

function atMidnight(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

function row(
  creator: CreatorInput,
  invoices: readonly CreatorInvoiceInput[],
  links: readonly CreatorViewInput[],
  contents: readonly CreatorContentInput[],
  today: Date,
): CreatorRow {
  const mine = contents.filter((item) => item.creatorId === creator.creatorId);
  const resolved = mine.filter((item) => !item.isProposal && item.videoSubmittedAt !== null);
  const onTime = resolved.filter((item) => {
    const outcome = contentOutcome(
      {
        deadline: atMidnight(item.deadline),
        videoSubmittedAt: atMidnight(item.videoSubmittedAt!),
        isProposal: false,
        type: 'evergreen',
        submissionCount: 0,
      },
      today,
    );
    return outcome === 'on_time';
  }).length;
  const views = links
    .filter(
      (item) =>
        item.creatorId === creator.creatorId &&
        item.platform !== null &&
        item.views !== null &&
        MEASURED.includes(item.dataState),
    )
    .reduce((sum, item) => sum + item.views!, 0);
  const spending = invoices
    .filter((item) => item.creatorId === creator.creatorId)
    .reduce((sum, item) => sum + item.spending, 0);

  return {
    creatorId: creator.creatorId,
    name: creator.name,
    spending,
    sent: mine.filter((item) => !item.isProposal && item.videoSubmittedAt !== null).length,
    // The filter above guarantees a contract, so there is no null branch here to leave untested.
    quota: creator.contract!.quota,
    onTimeRate: resolved.length === 0 ? null : (onTime / resolved.length) * 100,
    views,
    costPer1000Views: views === 0 ? null : (spending / views) * 1000,
  };
}

function value(item: CreatorRow, key: CreatorSortKey): number | string | null {
  return item[key];
}

/**
 * One row per creator with a contract in the range. Null rates sort last whatever the direction,
 * and equal values break by name then id, so the order never depends on the database.
 */
export function creatorRows(
  creators: readonly CreatorInput[],
  invoices: readonly CreatorInvoiceInput[],
  links: readonly CreatorViewInput[],
  contents: readonly CreatorContentInput[],
  sort: CreatorSortKey,
  order: 'asc' | 'desc',
  today: Date,
): CreatorRow[] {
  const direction = order === 'asc' ? 1 : -1;
  return creators
    .filter((creator) => creator.contract !== null)
    .map((creator) => row(creator, invoices, links, contents, today))
    .sort((a, b) => {
      const left = value(a, sort);
      const right = value(b, sort);
      if (left === null || right === null) {
        if (left === right) return a.name.localeCompare(b.name) || a.creatorId.localeCompare(b.creatorId);
        return left === null ? 1 : -1;
      }
      const compared =
        typeof left === 'string' && typeof right === 'string'
          ? left.localeCompare(right)
          : Number(left) - Number(right);
      return compared === 0
        ? a.name.localeCompare(b.name) || a.creatorId.localeCompare(b.creatorId)
        : compared * direction;
    });
}
