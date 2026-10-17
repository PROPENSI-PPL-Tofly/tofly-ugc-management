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

/** One component per part of the invoice, so every part always has a result. */
export type InvoiceComponents = Readonly<
  Record<InvoiceComponentKey, InvoiceComponent>
>;

/** The components a running invoice adds up, in the order they are shown. */
export const DEFAULT_COMPONENTS: InvoiceComponents = {
  fixedRate: new FixedRateComponent(),
  additionalContent: new AdditionalContentComponent(),
  performanceBonus: new PerformanceBonusComponent(),
  penalty: new PenaltyComponent(),
};

export interface InvoiceBreakdown {
  components: Record<InvoiceComponentKey, ComponentResult>;
  /** What the components add up to, which may be below zero. */
  rawTotal: number;
  /** The amount owed; never below zero, since a creator cannot end up owing Tofly. */
  total: number;
  /** Whether the penalty outweighed the pay, so the total was held at zero. */
  floored: boolean;
}

export function calculateInvoice(
  context: InvoiceContext,
  components: InvoiceComponents = DEFAULT_COMPONENTS,
): InvoiceBreakdown {
  let rawTotal = 0;
  const calculate = (component: InvoiceComponent): ComponentResult => {
    const result = component.calculate(context);
    // A component still waiting for data adds nothing yet; it is not counted as zero earned.
    rawTotal += component.sign * (result.amount ?? 0);
    return result;
  };

  const results = {
    fixedRate: calculate(components.fixedRate),
    additionalContent: calculate(components.additionalContent),
    performanceBonus: calculate(components.performanceBonus),
    penalty: calculate(components.penalty),
  };

  return {
    components: results,
    rawTotal,
    total: Math.max(0, rawTotal),
    floored: rawTotal < 0,
  };
}
