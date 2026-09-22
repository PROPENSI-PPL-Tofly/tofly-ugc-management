// The shape the admin table consumes. Kept apart from the Prisma models so the API keeps its
// own vocabulary — dates are plain calendar days, the name is already assembled — and nothing
// that exists in the database purely for the workflow (OAuth tokens, phone numbers) can leak
// into a response by accident.

import type {
  ContentOutcome,
  Productivity,
  ProductivityLabel,
} from '../creator-metrics.js';

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
  completed: number;
  total: number;
  isCurrent: boolean;
}

export interface ContentEntry {
  id: string;
  name: string;
  type: string;
  deadline: string;
  status: string;
  outcome: ContentOutcome;
  videoLink: string | null;
}

export interface DraftEntry {
  contentId: string;
  contentName: string;
  revisionCount: number;
  latestLink: string;
  lastSubmittedAt: string;
}

export interface CreatorDetail extends CreatorSummary {
  phoneNumber: string | null;
  contractHistory: ContractHistoryEntry[];

  /** Content belonging to the current contract. */
  contents: ContentEntry[];

  drafts: DraftEntry[];
}