// What a running invoice's breakdown is frozen as when it is finalized (PBI-12). A pure function
// over the calculator's breakdown, like invoice-calculator.ts: no Prisma and no clock.
//
// Performance data arrives with PBI-19, so the bonus can still be waiting when a contract ends.
// The admin may freeze it at what the measured content earned, once told; a fee or penalty still
// waiting for a formula cannot be frozen at all.

import { UnprocessableEntityException } from '@nestjs/common';
import { frozenWithoutData, type BonusDataGapsDto } from './bonus-data-gaps.js';
import type { InvoiceBreakdown } from './invoice-calculator.js';
import type {
  ComponentResult,
  InvoiceComponentKey,
} from './invoice-component.js';

export interface SettledBreakdown {
  components: Record<InvoiceComponentKey, ComponentResult>;
  /** What the frozen components add up to, before adjustments; may be below zero. */
  rawTotal: number;
  /** Whether the bonus was frozen before every content item had its performance data. */
  performanceBonusPending: boolean;
}

export function settleForFinalize(
  breakdown: InvoiceBreakdown,
  acceptPendingBonus: boolean,
  /** The waiting links (AC 9), carried in the refusal beside "Finalize tetap". */
  bonusDataGaps?: BonusDataGapsDto,
): SettledBreakdown {
  const { performanceBonus, ...rest } = breakdown.components;

  if (Object.values(rest).some(isWaiting)) {
    throw new UnprocessableEntityException({
      code: 'INVOICE_DATA_INCOMPLETE',
      message: 'Invoice memiliki komponen yang belum dapat dihitung',
    });
  }

  if (!isWaiting(performanceBonus)) {
    return {
      components: breakdown.components,
      rawTotal: breakdown.rawTotal,
      performanceBonusPending: false,
    };
  }

  if (!acceptPendingBonus) {
    throw new UnprocessableEntityException({
      code: 'INVOICE_BONUS_PENDING',
      message: 'Bonus performa masih menunggu data',
      ...(bonusDataGaps && { bonusDataGaps }),
    });
  }

  // A waiting component added nothing to rawTotal, so the measured lines are added on top. Each
  // link still waiting is kept as an Rp0 no_data line: a frozen invoice no longer waits.
  const lines = performanceBonus.lines.map(frozenWithoutData);
  const measured = lines.reduce(
    (sum, line) => sum + line.amount,
    0,
  );
  return {
    components: {
      ...breakdown.components,
      performanceBonus: {
        ...performanceBonus,
        amount: measured,
        status: 'calculated',
        lines,
      },
    },
    rawTotal: breakdown.rawTotal + measured,
    performanceBonusPending: true,
  };
}

function isWaiting(component: ComponentResult): boolean {
  return component.status === 'waiting_for_data';
}
