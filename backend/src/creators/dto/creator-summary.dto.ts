// The shape the admin table and detail view consume. Kept separate from the Prisma models
// so the API keeps its own vocabulary: dates are plain calendar days, the name is already
// assembled, and nothing that lives in the database purely for the workflow (OAuth tokens,
// internal notes) can leak into a response by accident.

import type {
  ContentOutcome,
  Productivity,
  ProductivityLabel,
} from '../creator-metrics.js';

export type ContractStatus = 'active' | 'expired' | 'upcoming' | 'none';

export interface ContractSummary {
  status: ContractStatus;
  /** ISO calendar day, or null when the creator has no contract at all. */
  startDate: string | null;
  endDate: string | null;
  /** Negative once the contract has ended; null without a contract. */
  daysRemaining: number | null;
  /** 1 for the first contract, 2 after the first renewal, and so on. */
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
  progress: { submitted: number; total: number; percent: number };
  performance: {
    onTimeRate: number | null;
    avgRevisions: number;
    productivity: Productivity;
    productivityLabel: ProductivityLabel;
  };
}

export interface CreatorListStats {
  total: number;
  active: number;
  good: number;
  risk: number;
}

export interface CreatorListResponse {
  items: CreatorSummary[];
  page: number;
  pageSize: number;
  /** Creators matching the filters, across every page. */
  total: number;
  totalPages: number;
  /** Headline counts over the whole roster, deliberately unaffected by the filters. */
  stats: CreatorListStats;
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
  /** Content of the current contract only — the period the summary describes. */
  contents: ContentEntry[];
  drafts: DraftEntry[];
}
