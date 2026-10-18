import { onTime } from './invoice-days.js';
import {
  calculated,
  type ComponentResult,
  type InvoiceComponent,
  type InvoiceContext,
  type InvoiceLine,
  waitingForData,
} from './invoice-component.js';

/**
 * Additional content is Specific content, outside the contract quota. Each item delivered on
 * time earns the formula's flat fee. A late item is still accepted but pays Rp0 (for now; the
 * rule is still to be confirmed with the client); it keeps a Rp0 line marked late, so the fee it
 * did not earn can be traced to it. With no formula saved yet the fee waits for one.
 */
export class AdditionalContentComponent implements InvoiceComponent {
  readonly key = 'additionalContent' as const;
  readonly sign = 1 as const;

  calculate({ contents, formula }: InvoiceContext): ComponentResult {
    if (formula === null) return waitingForData(this.key);

    // Delivered (link_submitted) content is committed by definition, so a pending proposal never counts.
    const delivered = contents.filter(
      (content) =>
        content.type === 'specific' && content.status === 'link_submitted',
    );

    return calculated(
      this.key,
      delivered.map((content): InvoiceLine =>
        onTime(content.deadline, content.videoSubmittedAt)
          ? {
              contentId: content.id,
              contentName: content.name,
              amount: formula.specificBonus,
              basis: { fee: formula.specificBonus },
            }
          : {
              contentId: content.id,
              contentName: content.name,
              amount: 0,
              basis: { fee: formula.specificBonus, late: 'yes' },
            },
      ),
    );
  }
}
