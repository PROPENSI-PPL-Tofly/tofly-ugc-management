import { onTime } from './invoice-days.js';
import {
  calculated,
  type ComponentResult,
  type InvoiceComponent,
  type InvoiceContent,
  type InvoiceContext,
  type InvoiceLine,
  type SocialPlatform,
  waitingForData,
} from './invoice-component.js';
import type {
  BonusTier,
  PerformanceMetric,
  PlatformBonus,
} from './rate-formula.js';

/** Delivered content that can earn a bonus, so its platform is known. */
type DeliveredContent = InvoiceContent & { platform: SocialPlatform };

/**
 * Where each metric a platform can be judged on is read: the content's first link carries all
 * four (PBI-27 27.1). A Record over every metric, so one added later cannot be left unread.
 */
const METRIC_COLUMNS: Readonly<
  Record<
    PerformanceMetric,
    keyof Pick<InvoiceContent, 'views' | 'likes' | 'comments' | 'shares'>
  >
> = Object.freeze({
  views: 'views',
  likes: 'likes',
  comments: 'comments',
  shares: 'shares',
});

/** A content item's value on a metric, or null while there is none to read. */
function metricValue(
  content: InvoiceContent,
  metric: PerformanceMetric,
): number | null {
  return content[METRIC_COLUMNS[metric]];
}

/** The highest tier a value reaches, numbered from 1 in ascending order, or null below the lowest. */
function reachedTier(
  tiers: readonly BonusTier[],
  value: number,
): { tier: number; bonus: number } | null {
  const ascending = [...tiers].sort((a, b) => a.threshold - b.threshold);
  let reached: { tier: number; bonus: number } | null = null;
  ascending.forEach((tier, index) => {
    if (value >= tier.threshold) {
      reached = { tier: index + 1, bonus: tier.bonus };
    }
  });
  return reached;
}

/** Delivered content that can earn a bonus: a late Specific item pays nothing, bonus included. */
function eligible(content: InvoiceContent): content is DeliveredContent {
  if (content.status !== 'link_submitted' || content.platform === null)
    return false;
  return (
    content.type === 'evergreen' ||
    onTime(content.deadline, content.videoSubmittedAt)
  );
}

/**
 * Per content item, the highest tier its platform's metric reaches. Each item is measured on
 * its first link's number for the platform's metric (PBI-27), one line per item at most. While any item that
 * could earn a bonus has no value to measure, the bonus waits for data, so a partial sum never
 * reads as final; the lines already known are kept.
 */
export class PerformanceBonusComponent implements InvoiceComponent {
  readonly key = 'performanceBonus' as const;
  readonly sign = 1 as const;

  calculate({ contents, formula }: InvoiceContext): ComponentResult {
    if (formula === null) return waitingForData(this.key);

    const lines: InvoiceLine[] = [];
    let ruled = 0;
    let unmeasured = 0;

    for (const content of contents.filter(eligible)) {
      const rule: PlatformBonus | undefined =
        formula.performanceBonus[content.platform];
      if (!rule) continue;
      ruled += 1;

      const value = metricValue(content, rule.metric);
      if (value === null) {
        unmeasured += 1;
        continue;
      }

      const reached = reachedTier(rule.tiers, value);
      if (!reached) continue;
      lines.push({
        contentId: content.id,
        contentName: content.name,
        amount: reached.bonus,
        basis: {
          platform: content.platform,
          metric: rule.metric,
          value,
          tier: reached.tier,
        },
      });
    }

    if (ruled === 0 || unmeasured > 0) return waitingForData(this.key, lines);
    return calculated(this.key, lines);
  }
}
