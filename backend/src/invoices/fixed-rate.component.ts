import { jakartaDay } from '../creators/evergreen.js';
import type {
  ComponentResult,
  InvoiceComponent,
  InvoiceContext,
} from './invoice-component.js';

/**
 * The contract's fixed rate, paid in full for the period (decided 11 Oct 2026): a quota left
 * unmet is handled by the penalty or a manual adjustment, never by scaling this down. A
 * contract that has not started yet has earned nothing.
 */
export class FixedRateComponent implements InvoiceComponent {
  readonly key = 'fixedRate' as const;
  readonly sign = 1 as const;

  calculate({ contract, contents, today }: InvoiceContext): ComponentResult {
    const started = jakartaDay(today) >= jakartaDay(contract.startDate);
    const delivered = contents.filter(
      (content) =>
        content.type === 'evergreen' && content.status === 'link_submitted',
    ).length;

    return {
      key: this.key,
      amount: started ? contract.fixedRate : 0,
      status: 'calculated',
      lines: [
        {
          contentId: contract.id,
          contentName: 'Kontrak',
          amount: started ? contract.fixedRate : 0,
          basis: { delivered, quota: contract.contentQuota },
        },
      ],
    };
  }
}
