import { onTime } from './invoice-days.js';
import type {
  ComponentResult,
  InvoiceComponent,
  InvoiceContent,
  InvoiceContext,
  InvoiceLine,
} from './invoice-component.js';
import type { BonusTier, PlatformBonus } from './rate-formula.js';

/** The highest tier a value reaches, numbered from 1 in ascending order, or null below the lowest. */
function reachedTier(
  tiers: readonly BonusTier[],
  value: number,
): { tier: number; bonus: number; minimum: number } | null {
  const ascending = [...tiers].sort((a, b) => a.minimum - b.minimum);
  let reached: { tier: number; bonus: number; minimum: number } | null = null;
  ascending.forEach((tier, index) => {
    if (value >= tier.minimum) {
      reached = { tier: index + 1, bonus: tier.bonus, minimum: tier.minimum };
    }
  });
  return reached;
}

/** Delivered content that can earn a bonus: a late Specific item pays nothing, bonus included. */
function eligible(content: InvoiceContent): boolean {
  if (content.status !== 'link_submitted' || content.platform === null)
    return false;
  return (
    content.type === 'evergreen' ||
    onTime(content.deadline, content.videoSubmittedAt)
  );
}

/**
 * Per content item, the highest tier its platform's metric reaches. Performance data arrives
 * with PBI-19; until any delivered item has a value to measure, the bonus is waiting for data
 * rather than a zero that would read as "earned nothing".
 */
export class PerformanceBonusComponent implements InvoiceComponent {
  readonly key = 'performanceBonus' as const;
  readonly sign = 1 as const;

  calculate({ contents, formula }: InvoiceContext): ComponentResult {
    const measured = contents
      .filter(eligible)
      .map((content) => {
        const rule: PlatformBonus | undefined =
          formula.performanceBonus[
            content.platform as NonNullable<InvoiceContent['platform']>
          ];
        const value = rule ? content[rule.metric] : null;
        return { content, rule, value };
      })
      .filter(({ value }) => value !== null);

    if (measured.length === 0) {
      return {
        key: this.key,
        amount: null,
        status: 'waiting_for_data',
        lines: [],
      };
    }

    const lines: InvoiceLine[] = [];
    for (const { content, rule, value } of measured) {
      const reached = rule ? reachedTier(rule.tiers, value as number) : null;
      if (!rule || !reached) continue;
      lines.push({
        contentId: content.id,
        contentName: content.name,
        amount: reached.bonus,
        basis: {
          platform: content.platform as string,
          metric: rule.metric,
          value: value as number,
          tier: reached.tier,
        },
      });
    }

    return {
      key: this.key,
      amount: lines.reduce((sum, line) => sum + line.amount, 0),
      status: 'calculated',
      lines,
    };
  }
}
