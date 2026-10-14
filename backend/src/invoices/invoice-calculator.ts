// The running invoice of one contract (PBI-8, 8.3): a pure function over plain values, like
// creator-metrics.ts. No Prisma types and no clock; the service loads rows, maps them to these
// inputs and passes today in.

import { AdditionalContentComponent } from './additional-content.component.js';
import { FixedRateComponent } from './fixed-rate.component.js';
import type {
  ComponentResult,
  InvoiceComponent,
  InvoiceComponentKey,
  InvoiceContext,
} from './invoice-component.js';
import { PenaltyComponent } from './penalty.component.js';
import { PerformanceBonusComponent } from './performance-bonus.component.js';

/** The components a running invoice adds up, in the order they are shown. */
export const DEFAULT_COMPONENTS: readonly InvoiceComponent[] = [
  new FixedRateComponent(),
  new AdditionalContentComponent(),
  new PerformanceBonusComponent(),
  new PenaltyComponent(),
];

export interface InvoiceBreakdown {
  components: Partial<Record<InvoiceComponentKey, ComponentResult>>;
  /** What the components add up to, which may be below zero. */
  rawTotal: number;
  /** The amount owed; never below zero, since a creator cannot end up owing Tofly. */
  total: number;
  /** Whether the penalty outweighed the pay, so the total was held at zero. */
  floored: boolean;
}

export function calculateInvoice(
  context: InvoiceContext,
  components: readonly InvoiceComponent[] = DEFAULT_COMPONENTS,
): InvoiceBreakdown {
  const results: Partial<Record<InvoiceComponentKey, ComponentResult>> = {};
  let rawTotal = 0;

  for (const component of components) {
    const result = component.calculate(context);
    results[component.key] = result;
    // A component still waiting for data adds nothing yet; it is not counted as zero earned.
    rawTotal += component.sign * (result.amount ?? 0);
  }

  return {
    components: results,
    rawTotal,
    total: Math.max(0, rawTotal),
    floored: rawTotal < 0,
  };
}
