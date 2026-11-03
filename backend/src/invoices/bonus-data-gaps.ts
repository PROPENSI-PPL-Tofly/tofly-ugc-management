import type { link_data_state, social_platform } from '@prisma/client';
import type { FrozenPerformanceLinkDto } from './frozen-links.js';
import type { InvoiceLine } from './invoice-component.js';
import type { PerformanceMetric } from './rate-formula.js';

// ─── PBI-28.1 INTEGRATION POINT ───────────────────────────────────────────────────────────────
// Two SCRUM-236 requirements need PBI-28.1's per-link bonus, which was reverted (#151) and not yet
// redone. They are NOT complete:
//   - AC 9: the links eligible for a bonus still missing their configured metric (the "waiting"
//     list beside "Finalize tetap");
//   - the Rp0 bonus line, basis.status 'no_data', for each such link frozen anyway.
// Until 28.1 lands, Finalize reports them as unavailable, naming the dependency. It never answers
// an empty list (which would read as "nothing is waiting") or adds a line of its own.
// What 28.1 must connect is in docs/SCRUM-236-learnings.md, "Integration dependencies".
// ───────────────────────────────────────────────────────────────────────────────────────────────

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
 * What Finalize knows of the bonus's data gaps. `available: false` is the only answer before
 * PBI-28.1; the `available: true` shape is the contract 28.1's per-link calculation fills.
 */
export type BonusDataGapsDto =
  | { available: false; reason: 'PBI_28_1_PENDING' }
  | {
      available: true;
      waiting: WaitingBonusLinkDto[];
      noDataLines: InvoiceLine[];
    };

export const BONUS_DATA_GAPS_PENDING_PBI_28_1 = Object.freeze({
  available: false,
  reason: 'PBI_28_1_PENDING',
} as const);

/** PBI-28.1: replace with the per-link calculation's waiting links and no-data lines. */
export function bonusDataGaps(): BonusDataGapsDto {
  return BONUS_DATA_GAPS_PENDING_PBI_28_1;
}

/**
 * The Rp0 line of a link frozen without its configured metric, for PBI-28.1's calculator to emit
 * once it knows the link is eligible. A link that has the number (a measured 0 included) is not a
 * gap, so asking for its line is a programming error.
 */
export function noDataLine(
  link: FrozenPerformanceLinkDto,
  metric: PerformanceMetric,
): InvoiceLine {
  if (link[metric] !== null) {
    throw new Error(
      `link of ${link.contentId} has ${metric}; only a missing metric gets a no_data line`,
    );
  }
  return {
    contentId: link.contentId,
    contentName: link.contentName,
    amount: 0,
    basis: { platform: link.platform, metric, status: 'no_data' },
  };
}
