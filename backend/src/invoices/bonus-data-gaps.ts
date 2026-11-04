import type { link_data_state, social_platform } from '@prisma/client';
import type { ComponentResult, InvoiceLine } from './invoice-component.js';
import type { PerformanceMetric } from './rate-formula.js';

// What Finalize knows of the links the performance bonus still waits on (PBI-28 AC 9), read off
// the per-link bonus lines 28.1 calculates: every judged link without its configured metric is a
// line with basis.status 'waiting'. Finalize runs the calculation on the contract it has locked,
// so the list, the bonus and the frozen links are one set of numbers.

/** One link eligible for a bonus whose configured metric has no number yet (AC 9). */
export interface WaitingBonusLinkDto {
  contentId: string;
  contentName: string;
  platform: social_platform;
  /** The metric the formula judges this platform on. */
  metric: PerformanceMetric;
  /** Its state as read under Finalize's lock: why the number is missing. */
  state: link_data_state;
}

/**
 * The waiting links beside "Finalize tetap", and the Rp0 line each is frozen as if the admin
 * freezes anyway. `available` stays in the answer so a reader that checks it still reads the list.
 */
export interface BonusDataGapsDto {
  available: true;
  waiting: WaitingBonusLinkDto[];
  noDataLines: InvoiceLine[];
}

function isWaiting(line: InvoiceLine): boolean {
  return line.basis.status === 'waiting';
}

/** The waiting link a bonus line describes; the component wrote its basis (waitingLine). */
function waitingLink({
  contentId,
  contentName,
  basis,
}: InvoiceLine): WaitingBonusLinkDto {
  return {
    contentId,
    contentName,
    platform: basis.platform as social_platform,
    metric: basis.metric as PerformanceMetric,
    state: basis.state as link_data_state,
  };
}

/**
 * The line a frozen invoice keeps for a link still waiting: Rp0, marked no_data, with its state and
 * trace, since the numbers will never come in for it (PBI-32 corrects it later). A measured line
 * is kept as it is.
 */
export function frozenWithoutData(line: InvoiceLine): InvoiceLine {
  if (!isWaiting(line)) return line;
  return { ...line, amount: 0, basis: { ...line.basis, status: 'no_data' } };
}

export function bonusDataGaps(bonus: ComponentResult): BonusDataGapsDto {
  const waiting = bonus.lines.filter(isWaiting);
  return {
    available: true,
    waiting: waiting.map(waitingLink),
    noDataLines: waiting.map(frozenWithoutData),
  };
}
