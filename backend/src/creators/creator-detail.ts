// A creator's contract periods: the creator → contract part of the tree the Creator Detail page
// reads. Each period carries its terms and its own numbers; its contents are not repeated here,
// because GET /contents?contract=<id> already pages, filters and counts them for the table.
//
// Pure, like creator-metrics.ts: the rows come in already loaded and `today` is passed in, so
// the service is left with loading and the periods can be tested without a database. Contents
// belong to a period through their contract, never through their deadline, so a deadline moved
// across a period's edge cannot make a content count under the wrong contract.

import type { content_status, Prisma } from '@prisma/client';
import { contentTags } from '../contents/content-tags.js';
import {
  computePerformance,
  computeProgress,
  contentOutcome,
  contractStatus,
  currentContract,
  type MetricsContent,
  type MetricsContract,
} from './creator-metrics.js';
import type {
  ContentEntry,
  ContractPeriod,
  ContractType,
  DraftEntry,
} from './dto/creator-summary.dto.js';

export interface DetailSubmissionRow {
  link: string;
  created_at: Date;
}

export interface DetailContentRow {
  id: string;
  name: string;
  type: 'evergreen' | 'specific';
  deadline: Date;
  status: content_status;
  /** The first link only (PBI-38), or none before it. */
  content_links: { url: string }[];
  video_submitted_at: Date | null;
  approval_bypassed: boolean;
  _count: { submissions: number };
  /** The newest hand-in only, or none before the first. */
  submissions: DetailSubmissionRow[];
}

export interface DetailContractRow {
  id: string;
  start_date: Date;
  end_date: Date;
  days_between: number;
  content_quota: number;
  fixed_rate: Prisma.Decimal;
  contract_type: ContractType;
  /** Deadline first. */
  contents: DetailContentRow[];
}

/** Postgres `date` columns arrive as midnight UTC; the first ten ISO characters are the day. */
function calendarDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toMetricsContent(row: DetailContentRow): MetricsContent {
  return {
    deadline: row.deadline,
    videoSubmittedAt: row.video_submitted_at,
    // A pending proposal is not a commitment until an admin accepts it.
    isProposal: row.status === 'pending',
    submissionCount: row._count.submissions,
  };
}

function toMetricsContract(row: DetailContractRow): MetricsContract {
  return {
    id: row.id,
    startDate: row.start_date,
    endDate: row.end_date,
    contents: row.contents.map(toMetricsContent),
  };
}

/** The same count Tambah Konten checks a new Evergreen slot against (evergreen-slot.ts). */
function remainingEvergreenQuota(row: DetailContractRow): number {
  const evergreen = row.contents.filter(
    (content) => content.type === 'evergreen',
  ).length;

  return Math.max(0, row.content_quota - evergreen);
}

/** Every contract as a period, in the order given (oldest first), numbered from 1. */
export function toContractPeriods(
  rows: DetailContractRow[],
  today: Date,
): ContractPeriod[] {
  const contracts = rows.map(toMetricsContract);
  const current = currentContract(contracts, today);

  return rows.map((row, index): ContractPeriod => {
    const metrics = contracts[index];
    const progress = computeProgress(metrics.contents);

    return {
      id: row.id,
      periodNumber: index + 1,
      startDate: calendarDay(row.start_date),
      endDate: calendarDay(row.end_date),
      daysBetween: row.days_between,
      contentQuota: row.content_quota,
      // numeric(14, 2) holds at most 14 significant digits, within what a JS number keeps exact.
      fixedRate: row.fixed_rate.toNumber(),
      remainingEvergreenQuota: remainingEvergreenQuota(row),
      type: row.contract_type,
      // A contract is never 'none'; that status only describes a creator without one.
      status: contractStatus(metrics, today) as ContractPeriod['status'],
      completed: progress.submitted,
      total: progress.total,
      isCurrent: metrics === current,
      progress,
      performance: computePerformance(metrics, today),
    };
  });
}

/** A contract's contents in the flat shape the old detail modal reads, deadline first. */
export function toContentEntries(
  row: DetailContractRow,
  today: Date,
): ContentEntry[] {
  return row.contents.map((content) => ({
    id: content.id,
    name: content.name,
    type: content.type,
    deadline: calendarDay(content.deadline),
    status: content.status,
    outcome: contentOutcome(toMetricsContent(content), today),
    tags: contentTags(
      {
        deadline: content.deadline,
        status: content.status,
        videoSubmittedAt: content.video_submitted_at,
        latestDraftAt: content.submissions[0]?.created_at ?? null,
        approvalBypassed: content.approval_bypassed,
      },
      today,
    ),
    videoLink: content.content_links[0]?.url ?? null,
  }));
}

/** The contract's handed-in contents with their newest draft, as the old detail modal reads them. */
export function toDraftEntries(row: DetailContractRow): DraftEntry[] {
  return row.contents.flatMap((content) => {
    const [latest] = content.submissions;

    if (!latest) {
      return [];
    }

    return [
      {
        contentId: content.id,
        contentName: content.name,
        // Every hand-in after the first is a revision.
        revisionCount: content._count.submissions - 1,
        latestLink: latest.link,
        lastSubmittedAt: calendarDay(latest.created_at),
      },
    ];
  });
}
