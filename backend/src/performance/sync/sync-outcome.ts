import type { link_data_state, social_platform } from '@prisma/client';
import type {
  LinkReading,
  PerformanceMetrics,
  SourceResult,
} from '../ports.js';
import type { SyncGroup } from './sync-selection.js';

/**
 * One link a sync could not bring up to date, named by its content and platform (a content holds
 * one link per platform). The sync owns this shape; Finalize's last sync (PBI-28) reads it.
 */
export interface UnsyncedLink {
  contentId: string;
  platform: social_platform;
}

// What one source call means for each of its links (PBI-27, 27.4, AC 3, 6, 7, 8, 17), without
// Prisma or a clock of its own, so every sync writes the same states.

/**
 * What a group's source call came to: the source's own answer, an error or a missed deadline
 * (`error`), or no source for that platform in this environment (`unavailable`).
 */
export type GroupResult =
  SourceResult | { outcome: 'error' } | { outcome: 'unavailable' };

/** The numbers a platform gave. One it left empty is absent, so the stored number stays. */
type ReportedMetrics = Partial<Record<keyof PerformanceMetrics, number>>;

/** The columns a sync writes on one link; numbers only when the platform gave them. */
export type LinkWrite =
  | (ReportedMetrics & {
      data_state: 'synced';
      last_synced_at: Date;
      manual_by: null;
      manual_at: null;
    })
  | { data_state: 'not_found' | 'sync_failed' | 'not_connected' };

/** Numbers an admin typed in and what the platform's took their place with (AC 17). */
export interface ManualReplacement {
  before: PerformanceMetrics;
  after: PerformanceMetrics;
}

/** One link after a sync: whether it is up to date, and what to write (null: leave it be). */
export interface LinkOutcome {
  linkId: string;
  contentId: string;
  platform: social_platform;
  /** The state the write is made against, so a change landing meanwhile wins. */
  storedState: link_data_state;
  synced: boolean;
  write: LinkWrite | null;
  /** Set only when this write replaces manual numbers. */
  replacedManual?: ManualReplacement;
}

/** What a run reports: its counts for the log (27.4) and the links it left as they were. */
export interface SyncSummary {
  processed: number;
  succeeded: number;
  failed: number;
  notUpdated: UnsyncedLink[];
}

function reported(metrics: PerformanceMetrics): ReportedMetrics {
  return Object.fromEntries(
    Object.entries(metrics).filter(([, value]) => value !== null),
  );
}

function writeFor(reading: LinkReading | undefined, now: Date): LinkWrite {
  switch (reading?.outcome) {
    case 'synced':
      // The platform's numbers replace any an admin typed in (AC 17). A number it left empty
      // keeps what is stored, and one never stored stays empty (AC 2).
      return {
        ...reported(reading.metrics),
        data_state: 'synced',
        last_synced_at: now,
        manual_by: null,
        manual_at: null,
      };
    // The last numbers stay: deleted, private or another account's video (AC 8, 11).
    case 'not_found':
      return { data_state: 'not_found' };
    // Failed, or no reading at all: kept and retried in the next run (AC 6).
    default:
      return { data_state: 'sync_failed' };
  }
}

function groupWrite(
  result: Exclude<GroupResult, { outcome: 'read' }>,
): LinkWrite | null {
  switch (result.outcome) {
    // No account or a refused refresh: "Akun belum terhubung" (AC 7).
    case 'disconnected':
      return { data_state: 'not_connected' };
    // The source threw or ran out of time: every link is retried in the next run (AC 6).
    case 'error':
      return { data_state: 'sync_failed' };
    // No source reads this platform here: nothing was asked, so nothing changes.
    case 'unavailable':
      return null;
  }
}

function replacementOf(
  link: SyncGroup['links'][number],
  write: LinkWrite,
): ManualReplacement {
  const before = link.storedMetrics;
  const written = Object.entries(write).filter(([name]) => name in before);
  // A number the platform left empty keeps what is stored, so it is unchanged here too.
  return { before, after: { ...before, ...Object.fromEntries(written) } };
}

function outcomeOf(
  link: SyncGroup['links'][number],
  write: LinkWrite | null,
): LinkOutcome {
  const synced = write?.data_state === 'synced';
  return {
    ...(synced &&
      link.storedState === 'manual' && {
        replacedManual: replacementOf(link, write),
      }),
    linkId: link.id,
    contentId: link.contentId,
    platform: link.platform,
    storedState: link.storedState,
    synced,
    // Numbers an admin typed in stay "Diisi manual" until the platform gives real ones (AC 14,
    // 17): a not found, failed or disconnected answer never takes them away.
    write: link.storedState === 'manual' && !synced ? null : write,
  };
}

/** Each link of a group with what its source call came to. */
export function outcomesFor(
  group: SyncGroup,
  result: GroupResult,
  now: Date,
): LinkOutcome[] {
  if (result.outcome !== 'read') {
    const shared = groupWrite(result);
    return group.links.map((link) => outcomeOf(link, shared));
  }
  const readings = new Map(
    result.readings.map((reading) => [reading.linkId, reading]),
  );
  return group.links.map((link) =>
    outcomeOf(link, writeFor(readings.get(link.id), now)),
  );
}

/** The run's counts, and every link it did not bring up to date. */
export function summarize(outcomes: readonly LinkOutcome[]): SyncSummary {
  const notUpdated = outcomes
    .filter((outcome) => !outcome.synced)
    .map(({ contentId, platform }) => ({ contentId, platform }));
  return {
    processed: outcomes.length,
    succeeded: outcomes.length - notUpdated.length,
    failed: notUpdated.length,
    notUpdated,
  };
}
