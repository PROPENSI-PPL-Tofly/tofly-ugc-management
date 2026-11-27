// The one contract the executive page and the backend share (PBI-24): every card, chart and
// creator row is named and shaped here, so the FE never invents a number or a formula.

import type { ExecutiveRange } from '../dashboard-range.js';

export const KPI_KEYS = [
  'totalSpending',
  'unpaid',
  'totalViews',
  'costPer1000Views',
  'onTimeRate',
  'engagementRate',
] as const;
export type KpiKey = (typeof KPI_KEYS)[number];

export type ChangeDirection = 'up' | 'down' | 'flat';

export interface KpiCard {
  key: KpiKey;
  label: string;
  /** null is shown as "—" when there is nothing to divide by. */
  value: number | null;
  /** The same figure for the previous range, so a rate's move can be shown in points. */
  previous: number | null;
  /** Ratio against the previous range; null when that range had no value. */
  change: number | null;
  direction: ChangeDirection;
  /** Whether a move in that direction helps the program. */
  good: boolean;
  formula: string;
}

export interface ChartPart {
  key: string;
  label: string;
  value: number;
}

export interface ChartMonth {
  month: string;
  parts: ChartPart[];
  total: number;
}

export interface ExecutiveChart {
  key: 'spending' | 'views' | 'timeliness';
  title: string;
  legend: { key: string; label: string }[];
  months: ChartMonth[];
}

export interface CreatorRow {
  creatorId: string;
  name: string;
  spending: number;
  sent: number;
  quota: number;
  onTimeRate: number | null;
  views: number;
  costPer1000Views: number | null;
}

export type CreatorSortKey =
  | 'name'
  | 'spending'
  | 'sent'
  | 'onTimeRate'
  | 'views'
  | 'costPer1000Views';

export interface ExecutiveDashboard {
  range: ExecutiveRange;
  kpis: KpiCard[];
  charts: ExecutiveChart[];
  creators: CreatorRow[];
  /** Links handed in but still without numbers, for the "n link belum ada data" note. */
  missingViewLinks: number;
}
