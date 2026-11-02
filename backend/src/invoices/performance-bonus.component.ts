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
import type { BonusTier } from './rate-formula.js';

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
function eligible(content: InvoiceContent): boolean {
  if (content.status !== 'link_submitted') return false;
  return (
    content.type === 'evergreen' ||
    onTime(content.deadline, content.videoSubmittedAt)
  );
}

/** Where a line's numbers came from (PBI-28 AC 6): typed in by an admin, or a sync. */
function sourceOf(link: InvoiceLink): Record<string, string> {
  return link.state === 'manual'
    ? { source: 'manual' }
    : {
        source: 'synced',
        ...(link.lastSyncedAt && {
          lastSyncedAt: link.lastSyncedAt.toISOString(),
        }),
      };
}

/**
 * Per link, the highest tier its own platform's metric reaches (PBI-28 AC 1), one line each, so
 * a cross-posted content earns the sum of its links (AC 2). A platform with no tiers pays nothing
 * (AC 4). While a link that could earn a bonus has no number on its metric, the bonus waits for
 * data, so a partial sum never reads as final; the lines already known are kept (AC 5). Nothing
 * delivered yet also waits, since a bonus may still come.
 */
export class PerformanceBonusComponent implements InvoiceComponent {
  readonly key = 'performanceBonus' as const;
  readonly sign = 1 as const;

  calculate({ contents, formula }: InvoiceContext): ComponentResult {
    if (formula === null) return waitingForData(this.key);

    const lines: InvoiceLine[] = [];
    let delivered = 0;
    let unmeasured = 0;

    for (const content of contents.filter(eligible)) {
      for (const link of content.links) {
        delivered += 1;
        const rule = formula.performanceBonus[link.platform];
        if (!rule || rule.tiers.length === 0) continue;

        const value = link[rule.metric];
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
            platform: link.platform,
            metric: rule.metric,
            value,
            tier: reached.tier,
            ...sourceOf(link),
          },
        });
      }
    }

    if (delivered === 0 || unmeasured > 0)
      return waitingForData(this.key, lines);
    return calculated(this.key, lines);
  }
}
