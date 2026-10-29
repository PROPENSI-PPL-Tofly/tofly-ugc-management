// The shape the admin table consumes. Kept apart from the Prisma models so the API keeps its
// own vocabulary — dates are plain calendar days, the name is already assembled — and nothing
// that exists in the database purely for the workflow (OAuth tokens, phone numbers) can leak
// into a response by accident.

import type { ContentStatus } from '../../contents/content-lifecycle.js';
import type { ContentTag } from '../../contents/content-tags.js';
import type {
  ContentOutcome,
  Productivity,
  ProductivityLabel,
} from '../creator-metrics.js';

/** Probation or regular (PRD 3.4); informational only, no rule reads it. */
export type ContractType = 'probation' | 'regular';

export interface ContractSummary {
  status: 'active' | 'expired' | 'upcoming' | 'none';

  /** ISO calendar day, or null when the creator has no contract at all. */
  startDate: string | null;

  endDate: string | null;

  /** Zero on the final day, negative once the contract has ended. */
  daysRemaining: number | null;

  /** 1 for the first contract, 2 after the first renewal; 0 without a contract. */
  periodNumber: number;

  contentQuota: number;

  /** The current contract's type; null without a contract. */
  type: ContractType | null;
}

export interface CreatorSummary {
  id: string;
  name: string;
  email: string;
  socials: Partial<Record<'instagram' | 'tiktok', string>>;
  accessRevokeDate: string | null;

  contract: ContractSummary;

  progress: {
    submitted: number;
    total: number;
    percent: number;
  };

  performance: {
    onTimeRate: number | null;
    avgRevisions: number;
    productivity: Productivity;
    productivityLabel: ProductivityLabel;
  };
}

export interface CreatorListResponse {
  items: CreatorSummary[];
  page: number;
  pageSize: number;

  /** Creators in the roster, across every page. */
  total: number;

  totalPages: number;
}

export interface ContractHistoryEntry {
  id: string;
  periodNumber: number;
  startDate: string;
  endDate: string;
  daysBetween: number;
  contentQuota: number;
  type: ContractType;

  /** Committed contents handed in; the same number as progress.submitted. */
  completed: number;

  /**
   * Committed contents in the period: pending proposals left out. Not a page size or a list
   * length; GET /contents?contract=<id> reports how many rows the table pages through.
   */
  total: number;

  isCurrent: boolean;
}

/**
 * Where a content is in its lifecycle, and what flags it for attention; the lists themselves
 * live in content-lifecycle.ts and content-tags.ts.
 */
export type { ContentStatus, ContentTag };

export interface ContentEntry {
  id: string;
  name: string;
  type: string;
  deadline: string;
  status: ContentStatus;
  outcome: ContentOutcome;

  /** Overdue or approval bypassed; empty when nothing needs attention. */
  tags: ContentTag[];

  videoLink: string | null;
}

export interface DraftEntry {
  contentId: string;
  contentName: string;
  revisionCount: number;
  latestLink: string;
  lastSubmittedAt: string;
}

/**
 * One contract period with its terms and its own numbers. Its contents are not listed here:
 * the table reads them from GET /contents?contract=<id>, which pages, filters and counts them.
 */
export interface ContractPeriod extends ContractHistoryEntry {
  status: Exclude<ContractSummary['status'], 'none'>;

  /** contracts.fixed_rate, in rupiah. */
  fixedRate: number;

  /** Evergreen contents the period can still take before its quota is full; never below 0. */
  remainingEvergreenQuota: number;

  progress: CreatorSummary['progress'];
  performance: CreatorSummary['performance'];
}

export interface CreatorDetail extends CreatorSummary {
  phoneNumber: string | null;

  /** Every contract period, oldest first. */
  contractHistory: ContractPeriod[];

  /**
   * Content belonging to the current contract.
   * @deprecated Read GET /contents?contract=<id>.
   * TODO(SCRUM-141): remove once the Creator Detail page replaces the old detail modal.
   */
  contents: ContentEntry[];

  /**
   * The current contract's handed-in contents.
   * @deprecated Read GET /contents/:id.
   * TODO(SCRUM-141): remove once the Creator Detail page replaces the old detail modal.
   */
  drafts: DraftEntry[];
}
