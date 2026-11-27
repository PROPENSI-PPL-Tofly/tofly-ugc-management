// The six executive KPIs (PBI-24, AC 3). Pure arithmetic over the numbers the repository read:
// no database, no clock, no formatting. The cards carry their own formula so the tooltip and the
// value can never drift apart.

import {
  KPI_KEYS,
  type KpiCard,
  type KpiKey,
} from './dto/executive-dashboard.dto.js';

/** The inputs each card is computed from, before the range's rows are added up. */
export interface KpiInputs {
  /** Totals of invoices finalized in the range, Cancelled left out. */
  spending: number;
  /** The part of that spending not yet Paid. */
  unpaid: number;
  /** Views of links handed in in the range whose numbers have arrived. */
  views: number;
  /** Likes + comments + shares on those same links. */
  engagement: number;
  /** Content due in the range. */
  due: number;
  /** Of that content, the part sent by its deadline. */
  onTime: number;
}

const LABELS: Record<KpiKey, string> = {
  totalSpending: 'Total Spending',
  unpaid: 'Belum Dibayar',
  totalViews: 'Total Views',
  costPer1000Views: 'Biaya per 1.000 Views',
  onTimeRate: 'On-time Rate',
  engagementRate: 'Engagement Rate',
};

export const FORMULAS: Record<KpiKey, string> = {
  totalSpending: 'Total invoices finalized in the range (Cancelled excluded)',
  unpaid: 'Finalized spending not yet in Paid',
  totalViews: 'Views of links handed in in the range with performance data',
  costPer1000Views: 'Total Spending ÷ Total Views × 1.000',
  onTimeRate: 'Content sent by its deadline ÷ content due in the range',
  engagementRate: '(likes + comments + shares) ÷ views',
};

/** Costs going up are bad news; views and rates going up are good news. */
const LOWER_IS_GOOD: readonly KpiKey[] = [
  'totalSpending',
  'unpaid',
  'costPer1000Views',
];

export const KPI_INPUTS = KPI_KEYS;

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function value(key: KpiKey, input: KpiInputs): number | null {
  switch (key) {
    case 'totalSpending':
      return input.spending;
    case 'unpaid':
      return input.unpaid;
    case 'totalViews':
      return input.views;
    case 'costPer1000Views': {
      const perView = ratio(input.spending, input.views);
      return perView === null ? null : perView * 1000;
    }
    case 'onTimeRate': {
      const share = ratio(input.onTime, input.due);
      return share === null ? null : share * 100;
    }
    case 'engagementRate': {
      const share = ratio(input.engagement, input.views);
      return share === null ? null : share * 100;
    }
  }
}

function card(key: KpiKey, current: KpiInputs, previous: KpiInputs): KpiCard {
  const now = value(key, current);
  const before = value(key, previous);
  const change = now !== null && before !== null ? ratio(now - before, before) : null;
  const direction =
    change === null || change === 0
      ? 'flat'
      : change > 0
        ? 'up'
        : 'down';
  const good =
    change === null ||
    change === 0 ||
    (LOWER_IS_GOOD.includes(key) ? direction === 'down' : direction === 'up');

  return {
    key,
    label: LABELS[key],
    value: now,
    previous: before,
    change,
    direction,
    good,
    formula: FORMULAS[key],
  };
}

/**
 * A card per KPI, each compared with the same-length previous range. A previous value of zero
 * has no percentage change to show, not infinity; a current denominator of zero shows "—".
 */
export function computeKpis(current: KpiInputs, previous: KpiInputs): KpiCard[] {
  return KPI_KEYS.map((key) => card(key, current, previous));
}
