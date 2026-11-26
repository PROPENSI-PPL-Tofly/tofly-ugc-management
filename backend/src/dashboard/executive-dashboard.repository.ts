// The reads behind the executive dashboard. A port, so the service never touches Prisma and its
// tests stay plain objects; the Prisma implementation lives beside it.

export const EXECUTIVE_DASHBOARD_REPOSITORY = Symbol('EXECUTIVE_DASHBOARD_REPOSITORY');

/** After finalizing, an invoice walks these states until Paid. Cancelled is off the pipeline. */
export const FINALIZED_STATUSES = [
  'finalized',
  'creator_acked',
  'payment_uploaded',
  'paid',
] as const;

export interface FinalizedInvoiceRow {
  creatorId: string;
  /** ISO day the invoice was finalized on, which is the range's date. */
  finalizedAt: string;
  status: string;
  fixedRate: number;
  additionalContent: number;
  performanceBonus: number;
  /** The snapshot's total: after penalties and adjustments, never recalculated live. */
  total: number;
}

export interface DashboardLinkRow {
  creatorId: string;
  submittedAt: string;
  platform: 'instagram' | 'tiktok' | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  dataState: string;
}

export interface DashboardContentRow {
  creatorId: string;
  deadline: string;
  videoSubmittedAt: string | null;
  isProposal: boolean;
}

export interface DashboardCreatorRow {
  creatorId: string;
  name: string;
  quota: number;
  startDate: string;
  endDate: string;
}

export interface ExecutiveDashboardRepository {
  finalizedInRange(from: string, to: string): Promise<FinalizedInvoiceRow[]>;
  linksSentInRange(from: string, to: string): Promise<DashboardLinkRow[]>;
  contentsDueInRange(from: string, to: string): Promise<DashboardContentRow[]>;
  creatorsWithContracts(from: string, to: string): Promise<DashboardCreatorRow[]>;
}
