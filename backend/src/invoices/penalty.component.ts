import { jakartaDay } from '../creators/evergreen.js';
import { contractLastDay, daysBetween, daysLate } from './invoice-days.js';
import {
  calculated,
  type ComponentResult,
  type InvoiceComponent,
  type InvoiceContext,
  type InvoiceLine,
  isCommitted,
  waitingForData,
} from './invoice-component.js';

/**
 * Lateness on Evergreen content only (a late Specific item is not penalised; it loses its fee).
 * A late hand-in counts the days up to the hand-in. Content still not handed in counts up to
 * today, but never past the contract's last day. Either way an item is charged for at most
 * maxPenaltyDays (decided 12 Oct 2026). With no formula saved yet the penalty waits for one.
 */
export class PenaltyComponent implements InvoiceComponent {
  readonly key = 'penalty' as const;
  readonly sign = -1 as const;

  calculate({
    contract,
    contents,
    formula,
    today,
  }: InvoiceContext): ComponentResult {
    if (formula === null) return waitingForData(this.key);

    const lastDay = contractLastDay(contract);
    const todayDay = jakartaDay(today);
    const countUntil = todayDay < lastDay ? todayDay : lastDay;

    const lines: InvoiceLine[] = [];
    for (const content of contents) {
      if (content.type !== 'evergreen') continue;
      if (!isCommitted(content)) continue;

      const late =
        content.videoSubmittedAt !== null
          ? daysLate(content.deadline, content.videoSubmittedAt)
          : Math.max(0, daysBetween(jakartaDay(content.deadline), countUntil));
      if (late === 0) continue;

      const charged = Math.min(late, formula.maxPenaltyDays);
      lines.push({
        contentId: content.id,
        contentName: content.name,
        amount: charged * formula.latePenaltyPerDay,
        basis: {
          daysLate: late,
          chargedDays: charged,
          perDay: formula.latePenaltyPerDay,
          handedIn: content.videoSubmittedAt === null ? 'no' : 'yes',
        },
      });
    }

    return calculated(this.key, lines);
  }
}
