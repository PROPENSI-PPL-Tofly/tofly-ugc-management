import { onTime } from './invoice-days.js';
import {
  calculated,
  type ComponentResult,
  type InvoiceComponent,
  type InvoiceContent,
  type InvoiceContext,
  type InvoiceLine,
  type InvoiceLink,
  waitingForData,
} from './invoice-component.js';
import type {
  BonusTier,
  PerformanceMetric,
  PlatformBonus,
  RateFormula,
} from './rate-formula.js';

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

/** Content the creator has handed in with at least one link a platform's tiers can judge. */
function handedIn(content: InvoiceContent): boolean {
  return content.status === 'link_submitted' && content.links.length > 0;
}

/**
 * Whether handed-in content can earn a bonus (AC 3): a late Specific item loses it with its fee,
 * a late Evergreen item keeps it. Lateness is judged on the content's submitted date, the day its
 * first link was handed in (PBI-38).
 */
function eligible(content: InvoiceContent): boolean {
  return (
    content.type === 'evergreen' ||
    onTime(content.deadline, content.videoSubmittedAt)
  );
}

/** A platform's rule, or null when it has no tiers: such a platform pays no bonus (AC 4). */
function ruleFor(
  formula: RateFormula,
  link: InvoiceLink,
): PlatformBonus | null {
  const rule = formula.performanceBonus[link.platform];
  return rule && rule.tiers.length > 0 ? rule : null;
}

/** Where a link's number came from, as every bonus line carries it (AC 6). */
function trace(link: InvoiceLink) {
  return {
    source: link.source,
    lastSyncedAt: link.lastSyncedAt?.toISOString() ?? null,
  };
}

function earnedLine(
  content: InvoiceContent,
  link: InvoiceLink,
  metric: PerformanceMetric,
  value: number,
  reached: { tier: number; bonus: number },
): InvoiceLine {
  return {
    contentId: content.id,
    contentName: content.name,
    amount: reached.bonus,
    basis: {
      platform: link.platform,
      metric,
      value,
      tier: reached.tier,
      ...trace(link),
    },
  };
}

/** A link whose metric has no number yet: shown as waiting, worth nothing until measured (AC 5). */
function waitingLine(
  content: InvoiceContent,
  link: InvoiceLink,
  metric: PerformanceMetric,
): InvoiceLine {
  return {
    contentId: content.id,
    contentName: content.name,
    amount: 0,
    basis: {
      platform: link.platform,
      metric,
      status: 'waiting',
      ...trace(link),
    },
  };
}

/**
 * Per link, the highest tier its platform's metric reaches (AC 1), so a cross-posted content
 * earns the sum of its links' bonuses (AC 2). Numbers come from each link (PBI-27): views, likes,
 * comments and shares. While any judged link has no number, the bonus waits for data, so a
 * partial sum never reads as final; the measured links keep their lines beside the waiting ones.
 */
export class PerformanceBonusComponent implements InvoiceComponent {
  readonly key = 'performanceBonus' as const;
  readonly sign = 1 as const;

  calculate({ contents, formula }: InvoiceContext): ComponentResult {
    if (formula === null) return waitingForData(this.key);

    const delivered = contents.filter(handedIn);
    if (delivered.length === 0) return waitingForData(this.key);

    const lines: InvoiceLine[] = [];
    let waiting = false;

    for (const content of delivered.filter(eligible)) {
      for (const link of content.links) {
        const rule = ruleFor(formula, link);
        if (!rule) continue;

        const value = link[rule.metric];
        if (value === null) {
          waiting = true;
          lines.push(waitingLine(content, link, rule.metric));
          continue;
        }

        const reached = reachedTier(rule.tiers, value);
        if (reached) {
          lines.push(earnedLine(content, link, rule.metric, value, reached));
        }
      }
    }

    return waiting
      ? waitingForData(this.key, lines)
      : calculated(this.key, lines);
  }
}
