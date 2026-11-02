// What Finalize does with performance data (PBI-28, 28.2): one last sync of the contract's links,
// cut off after 20 seconds, then the links still without numbers and the numbers each link is
// frozen with. Pure except for the sync and its timer, like invoice-settlement.ts.

import type { LinkDataState } from '../performance/link-performance.js';
import type { ContractSync, UnsyncedLink } from '../performance/ports.js';
import type { InvoiceContent, SocialPlatform } from './invoice-component.js';
import { canEarnBonus } from './performance-bonus.component.js';
import type { PerformanceMetric, RateFormula } from './rate-formula.js';

/** How long Finalize waits for the last sync before going on with the stored numbers (AC 8). */
export const FINALIZE_SYNC_TIMEOUT_MS = 20_000;

export interface LastSync {
  /** done: the sync finished; unavailable: none is wired in yet; failed / timed_out: AC 8. */
  status: 'done' | 'unavailable' | 'failed' | 'timed_out';
  notUpdated: UnsyncedLink[];
}

/** One link named to the admin, with the state it was left in. */
export interface NamedLink {
  contentId: string;
  contentName: string;
  platform: SocialPlatform;
  state: LinkDataState;
}

/** A link that could earn a bonus but has no number on its platform's metric (AC 9). */
export interface WaitingLink extends NamedLink {
  metric: PerformanceMetric;
}

/** The numbers a link is frozen with (AC 10). */
export interface SnapshotLink extends NamedLink {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  source: 'synced' | 'manual';
  lastSyncedAt: string | null;
}

/** The last sync, never longer than FINALIZE_SYNC_TIMEOUT_MS and never a reason to fail (AC 8). */
export async function lastSyncBeforeFinalize(
  sync: ContractSync,
  contractId: string,
): Promise<LastSync> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<LastSync>((resolve) => {
    timer = setTimeout(
      () => resolve({ status: 'timed_out', notUpdated: [] }),
      FINALIZE_SYNC_TIMEOUT_MS,
    );
  });
  const finished = sync.syncContract(contractId).then(
    (result): LastSync =>
      result === null
        ? { status: 'unavailable', notUpdated: [] }
        : { status: 'done', notUpdated: result.notUpdated },
    (): LastSync => ({ status: 'failed', notUpdated: [] }),
  );
  try {
    return await Promise.race([finished, timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

function delivered(contents: readonly InvoiceContent[]) {
  return contents
    .filter((content) => content.status === 'link_submitted')
    .flatMap((content) => content.links.map((link) => ({ content, link })));
}

/**
 * The links the admin is told were not brought up to date (AC 8): the ones the sync named, or
 * every delivered link when the whole sync failed or ran out of time. None while no sync exists.
 */
export function notUpdatedLinks(
  contents: readonly InvoiceContent[],
  lastSync: LastSync,
): NamedLink[] {
  if (lastSync.status === 'unavailable') return [];
  const everyLink = lastSync.status !== 'done';
  return delivered(contents)
    .filter(
      ({ content, link }) =>
        everyLink ||
        lastSync.notUpdated.some(
          (named) =>
            named.contentId === content.id && named.platform === link.platform,
        ),
    )
    .map(({ content, link }) => ({
      contentId: content.id,
      contentName: content.name,
      platform: link.platform,
      state: link.state,
    }));
}

/** Each link that could earn a bonus, on a platform with tiers, with no number on its metric. */
export function waitingLinks(
  contents: readonly InvoiceContent[],
  formula: RateFormula | null,
): WaitingLink[] {
  if (formula === null) return [];
  return contents.filter(canEarnBonus).flatMap((content) =>
    content.links.flatMap((link) => {
      const rule = formula.performanceBonus[link.platform];
      if (!rule || rule.tiers.length === 0 || link[rule.metric] !== null) {
        return [];
      }
      return [
        {
          contentId: content.id,
          contentName: content.name,
          platform: link.platform,
          metric: rule.metric,
          state: link.state,
        },
      ];
    }),
  );
}

/** Every delivered link's numbers, source and sync time, as the snapshot keeps them (AC 10). */
export function snapshotLinks(
  contents: readonly InvoiceContent[],
): SnapshotLink[] {
  return delivered(contents).map(({ content, link }) => ({
    contentId: content.id,
    contentName: content.name,
    platform: link.platform,
    views: link.views,
    likes: link.likes,
    comments: link.comments,
    shares: link.shares,
    source: link.state === 'manual' ? 'manual' : 'synced',
    state: link.state,
    lastSyncedAt: link.lastSyncedAt?.toISOString() ?? null,
  }));
}
