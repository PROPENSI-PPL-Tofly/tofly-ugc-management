// The shape every part of an invoice shares. Each part (fixed rate, additional content fee,
// performance bonus, penalty) is its own InvoiceComponent, so the calculator only adds up
// whatever components it is given: a new kind of pay is a new component, not an edit to the
// calculator.

import type { ContentStatus } from '../contents/content-lifecycle.js';
import type { RateFormula } from './rate-formula.js';

export type SocialPlatform = 'instagram' | 'tiktok';
export type ContentType = 'evergreen' | 'specific';

export interface InvoiceContent {
  id: string;
  name: string;
  type: ContentType;
  status: ContentStatus;
  /** Postgres `date`, midnight UTC. */
  deadline: Date;
  /** Postgres `date`, midnight UTC; when the final video link was handed in. */
  videoSubmittedAt: Date | null;
  platform: SocialPlatform | null;
  views: number | null;
  likes: number | null;
}

export interface InvoiceContract {
  id: string;
  /** Postgres `date`, midnight UTC. */
  startDate: Date;
  /** Postgres `date`, midnight UTC. */
  endDate: Date;
  /** Paid in full for the contract period, whatever the number of items delivered. */
  fixedRate: number;
  contentQuota: number;
  /** When access was revoked before endDate; the contract stops counting days from then. */
  endedEarlyOn: Date | null;
}

export interface InvoiceContext {
  contract: InvoiceContract;
  contents: readonly InvoiceContent[];
  formula: RateFormula;
  /** The calculation has no clock of its own; the caller passes today in. */
  today: Date;
}

export type InvoiceComponentKey =
  'fixedRate' | 'additionalContent' | 'performanceBonus' | 'penalty';

/** One content item's share of a component, so every amount can be traced to its content. */
export interface InvoiceLine {
  contentId: string;
  contentName: string;
  amount: number;
  /** What the amount was worked out from, e.g. { daysLate: 5, chargedDays: 3 }. */
  basis: Record<string, number | string>;
}

export type ComponentStatus = 'calculated' | 'waiting_for_data';

export interface ComponentResult {
  key: InvoiceComponentKey;
  /** Always zero or more; `sign` on the component says whether it adds or subtracts. Null while waiting for data. */
  amount: number | null;
  status: ComponentStatus;
  lines: InvoiceLine[];
}

export interface InvoiceComponent {
  readonly key: InvoiceComponentKey;
  /** +1 adds to the total, -1 subtracts from it. */
  readonly sign: 1 | -1;
  calculate(context: InvoiceContext): ComponentResult;
}

/** A component result with a known amount, from its lines. */
export function calculated(
  key: InvoiceComponentKey,
  lines: InvoiceLine[],
): ComponentResult {
  return {
    key,
    amount: lines.reduce((sum, line) => sum + line.amount, 0),
    status: 'calculated',
    lines,
  };
}
