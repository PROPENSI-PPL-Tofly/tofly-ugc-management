import { COMMITTED_STATUSES } from '../contents/content-lifecycle.js';
import { onTime } from './invoice-days.js';
import {
  calculated,
  type ComponentResult,
  type InvoiceComponent,
  type InvoiceContent,
  type InvoiceContext,
} from './invoice-component.js';

/** Committed means an admin accepted it; a pending proposal is not work anyone owes yet. */
function committed(content: InvoiceContent): boolean {
  return (COMMITTED_STATUSES as readonly string[]).includes(content.status);
}

/**
 * Additional content is Specific content, outside the contract quota. Each item delivered on
 * time earns the formula's flat fee. A late item is still accepted but pays Rp0 (for now; the
 * rule is still to be confirmed with the client).
 */
export class AdditionalContentComponent implements InvoiceComponent {
  readonly key = 'additionalContent' as const;
  readonly sign = 1 as const;

  calculate({ contents, formula }: InvoiceContext): ComponentResult {
    const paid = contents.filter(
      (content) =>
        content.type === 'specific' &&
        committed(content) &&
        content.status === 'link_submitted' &&
        onTime(content.deadline, content.videoSubmittedAt),
    );

    return calculated(
      this.key,
      paid.map((content) => ({
        contentId: content.id,
        contentName: content.name,
        amount: formula.specificContentFee,
        basis: { fee: formula.specificContentFee },
      })),
    );
  }
}
