// A creator's contract periods, each with its own contents: the creator → contract → content →
// lifecycle tree the Creator Detail page reads.
//
// Pure, like creator-metrics.ts: the rows come in already loaded and `today` is passed in, so
// the service is left with loading and the tree can be tested without a database. Contents
// belong to a period through their contract, never through their deadline, so a deadline moved
// across a period's edge cannot make a content appear under the wrong contract.

import type { content_status } from '@prisma/client';
import { waitingOnFor } from '../contents/content-detail.js';
import { contentTags } from '../contents/content-tags.js';
import {
  computePerformance,
  computeProgress,
  contentOutcome,
  contractStatus,
  currentContract,
  type MetricsContract,
} from './creator-metrics.js';
import type {
  ContractPeriod,
  ContractType,
  PeriodContent,
} from './dto/creator-summary.dto.js';

export interface DetailSubmissionRow {
  id: string;
  link: string;
  revision_notes: string | null;
  created_at: Date;
}

export interface DetailContentRow {
  id: string;
  name: string;
  type: 'evergreen' | 'specific';
  deadline: Date;
  status: content_status;
  video_link: string | null;
  video_submitted_at: Date | null;
  approval_bypassed: boolean;
  /** Oldest first, so the last one is the latest draft. */
  submissions: DetailSubmissionRow[];
}

export interface DetailContractRow {
  id: string;
  start_date: Date;
  end_date: Date;
  days_between: number;
  content_quota: number;
  contract_type: ContractType;
  /** Deadline first. */
  contents: DetailContentRow[];
}

/** Postgres `date` columns arrive as midnight UTC; the first ten ISO characters are the day. */
function calendarDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toMetricsContract(row: DetailContractRow): MetricsContract {
  return {
    id: row.id,
    startDate: row.start_date,
    endDate: row.end_date,
    contents: row.contents.map((content) => ({
      deadline: content.deadline,
      videoSubmittedAt: content.video_submitted_at,
      // A pending proposal is not a commitment until an admin accepts it.
      isProposal: content.status === 'pending',
      submissionCount: content.submissions.length,
    })),
  };
}

function toPeriodContent(row: DetailContentRow, today: Date): PeriodContent {
  const latest = row.submissions.at(-1);

  return {
    id: row.id,
    name: row.name,
    type: row.type,
    deadline: calendarDay(row.deadline),
    status: row.status,
    outcome: contentOutcome(
      {
        deadline: row.deadline,
        videoSubmittedAt: row.video_submitted_at,
        isProposal: row.status === 'pending',
        submissionCount: row.submissions.length,
      },
      today,
    ),
    tags: contentTags(
      {
        deadline: row.deadline,
        status: row.status,
        videoSubmittedAt: row.video_submitted_at,
        latestDraftAt: latest?.created_at ?? null,
        approvalBypassed: row.approval_bypassed,
      },
      today,
    ),
    waitingOn: waitingOnFor(row.status),
    // The rule GET /contents counts by, so a row reads the same on every screen.
    revisionCount: row.submissions.filter(
      (submission) => submission.revision_notes !== null,
    ).length,
    latestDraft: latest
      ? { link: latest.link, submittedAt: latest.created_at.toISOString() }
      : null,
    videoLink: row.video_link,
    videoSubmittedAt: row.video_submitted_at
      ? calendarDay(row.video_submitted_at)
      : null,
  };
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
      type: row.contract_type,
      // A contract is never 'none'; that status only describes a creator without one.
      status: contractStatus(metrics, today) as ContractPeriod['status'],
      completed: progress.submitted,
      total: progress.total,
      isCurrent: metrics === current,
      progress,
      performance: computePerformance(metrics, today),
      contents: row.contents.map((content) => toPeriodContent(content, today)),
    };
  });
}
