import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  Prisma,
  type link_data_state,
  type social_platform,
} from '@prisma/client';
import { SYSTEM_ACTOR_NAME } from '../../contents/content-event-actors.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PerformanceSource } from '../ports.js';
import { mapWithLimit, withDeadline } from './run-limits.js';
import {
  outcomesFor,
  summarize,
  type GroupResult,
  type LinkOutcome,
  type LinkWrite,
  type ManualReplacement,
  type UnsyncedLink,
} from './sync-outcome.js';
import {
  canSync,
  groupLinks,
  SYNC_LINK_SELECT,
  syncableLinks,
  type SyncableContent,
  type SyncGroup,
  type SyncLinkRow,
  type SyncScope,
} from './sync-selection.js';

export const PERFORMANCE_SOURCES = Symbol('PERFORMANCE_SOURCES');
export const SYNC_LOG = Symbol('SYNC_LOG');
export const SYNC_CLOCK = Symbol('SYNC_CLOCK');

/** Creator+platform groups read at once: enough to finish fast, few enough not to flood a platform. */
export const GROUP_CONCURRENCY = 4;
/** How long one group's source call may take in the daily run and "Sinkronkan". */
export const GROUP_DEADLINE_MS = 60_000;
/** Finalize waits 20 s for its last sync (PBI-28); its calls stop then too. */
export const CONTRACT_DEADLINE_MS = 20_000;
/** How long a claim on a content holds, longer than its run can take; a dead run frees it then. */
export const LEASE_MS: Readonly<Record<SyncScope['kind'], number>> = {
  all: 30 * 60_000,
  content: 2 * 60_000,
  contract: 60_000,
};

/** A source that sees one video twice keeps it on the earlier link; the id breaks a tie. */
const OLDEST_LINK_FIRST: [{ created_at: 'asc' }, { id: 'asc' }] = [
  { created_at: 'asc' },
  { id: 'asc' },
];

export const SYNC_CONTENT_SELECT = {
  status: true,
  contracts: { select: { invoice: { select: { status: true } } } },
  content_links: { select: { platform: true } },
} as const;

export interface SyncLog {
  log(message: string): void;
  warn(message: string): void;
}

/** The slice of Prisma the sync touches, so tests stub exactly that. No token column is read. */
export interface PerformanceSyncClient {
  content_links: {
    findMany(args: {
      where: Prisma.content_linksWhereInput;
      select: typeof SYNC_LINK_SELECT;
      orderBy: typeof OLDEST_LINK_FIRST;
    }): Promise<SyncLinkRow[]>;
    updateMany(args: {
      where: { id: string; data_state: link_data_state };
      data: LinkWrite;
    }): Prisma.PrismaPromise<Prisma.BatchPayload>;
  };
  contents: {
    findUnique(args: {
      where: { id: string };
      select: typeof SYNC_CONTENT_SELECT;
    }): Promise<
      | (SyncableContent & { content_links: { platform: social_platform }[] })
      | null
    >;
    updateMany(args: {
      where: { id: { in: string[] }; performance_sync_lease_until: Date };
      data: { performance_sync_lease_until: null };
    }): Promise<Prisma.BatchPayload>;
  };
  content_events: {
    createMany(args: {
      data: Prisma.content_eventsCreateManyInput[];
    }): Promise<Prisma.BatchPayload>;
  };
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
  $transaction(
    operations: Prisma.PrismaPromise<Prisma.BatchPayload>[],
  ): Promise<Prisma.BatchPayload[]>;
}

/** What the daily run answers and logs (27.4). */
export interface SyncRunReport {
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  durationMs: number;
}

interface RunResult extends SyncRunReport {
  notUpdated: UnsyncedLink[];
}

// Only the error's name reaches the log: a message may quote a token or a row.
function nameOf(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown error';
}

/**
 * Brings links' performance numbers up to date (PBI-27, 27.4): the 02:00 WIB run, "Sinkronkan
 * Sekarang" and Finalize's last sync share one run. It talks only to PerformanceSource, so a new
 * platform is one more source and no change here (Strategy, Dependency Inversion, Open/Closed).
 */
@Injectable()
export class PerformanceSyncService {
  private readonly sources: ReadonlyMap<social_platform, PerformanceSource>;

  constructor(
    @Inject(PrismaService) private readonly prisma: PerformanceSyncClient,
    @Inject(PERFORMANCE_SOURCES) sources: readonly PerformanceSource[],
    @Optional()
    @Inject(SYNC_LOG)
    private readonly log: SyncLog = new Logger('PerformanceSync'),
    @Optional()
    @Inject(SYNC_CLOCK)
    private readonly now: () => Date = () => new Date(),
  ) {
    this.sources = new Map(sources.map((source) => [source.platform, source]));
  }

  /** Every syncable link (AC 4-6), for the Cloud Scheduler job. */
  async syncAll(): Promise<SyncRunReport> {
    const { notUpdated: _, ...report } = await this.run(
      { kind: 'all' },
      GROUP_DEADLINE_MS,
    );
    return report;
  }

  /** Every link of one content (AC 12), refused while another sync holds it (AC 13). */
  // With a platform, only that link: a link card's Refresh button (SCRUM-282).
  async syncContent(
    contentId: string,
    platform?: social_platform,
  ): Promise<{ notUpdated: { platform: social_platform }[] }> {
    const content = await this.prisma.contents.findUnique({
      where: { id: contentId },
      select: SYNC_CONTENT_SELECT,
    });
    if (!content) {
      throw new NotFoundException({
        code: 'CONTENT_NOT_FOUND',
        message: 'Konten tidak ditemukan',
      });
    }
    if (!canSync(content)) {
      throw new ConflictException({
        code: 'SYNC_NOT_ALLOWED',
        message: 'Konten ini tidak disinkronkan lagi',
      });
    }
    // A card's Refresh for a platform with no link is not a success: 404, as manual entry answers.
    if (
      platform &&
      !content.content_links.some((link) => link.platform === platform)
    ) {
      throw new NotFoundException({
        code: 'LINK_NOT_FOUND',
        message: 'Link tidak ditemukan',
      });
    }
    const result = await this.run(
      { kind: 'content', contentId, platform },
      GROUP_DEADLINE_MS,
    );
    if (result.skipped > 0) {
      throw new ConflictException({
        code: 'SYNC_RUNNING',
        message: 'Konten ini sedang disinkronkan',
      });
    }
    return {
      notUpdated: result.notUpdated.map(({ platform }) => ({ platform })),
    };
  }

  /** Finalize's last sync (PBI-28): one contract, within its 20 s. */
  async syncContract(
    contractId: string,
  ): Promise<{ notUpdated: UnsyncedLink[] }> {
    const { notUpdated } = await this.run(
      { kind: 'contract', contractId },
      CONTRACT_DEADLINE_MS,
    );
    return { notUpdated };
  }

  // One read of every link in scope, a claim on their contents, then each creator+platform
  // group read and saved on its own: a group that fails never stops another (AC 6).
  private async run(scope: SyncScope, deadlineMs: number): Promise<RunResult> {
    const startedAt = this.now();
    const rows = await this.prisma.content_links.findMany({
      where: syncableLinks(scope),
      select: SYNC_LINK_SELECT,
      orderBy: OLDEST_LINK_FIRST,
    });
    const leaseUntil = new Date(startedAt.getTime() + LEASE_MS[scope.kind]);
    const claimed = await this.claim(
      [...new Set(rows.map((row) => row.content_id))],
      startedAt,
      leaseUntil,
    );

    let outcomes: LinkOutcome[];
    try {
      const groups = groupLinks(
        rows.filter((row) => claimed.has(row.content_id)),
      );
      outcomes = (
        await mapWithLimit(groups, GROUP_CONCURRENCY, (group) =>
          this.syncGroup(group, deadlineMs),
        )
      ).flat();
    } finally {
      await this.release([...claimed], leaseUntil);
    }

    const skipped = groupLinks(
      rows.filter((row) => !claimed.has(row.content_id)),
    ).flatMap((group) => group.links);
    const summary = summarize(outcomes);
    const result: RunResult = {
      processed: summary.processed,
      succeeded: summary.succeeded,
      failed: summary.failed,
      skipped: skipped.length,
      durationMs: this.now().getTime() - startedAt.getTime(),
      notUpdated: [
        ...summary.notUpdated,
        ...skipped.map(({ contentId, platform }) => ({ contentId, platform })),
      ],
    };
    this.log.log(
      `performance sync ${scope.kind}: processed=${result.processed} succeeded=${result.succeeded} failed=${result.failed} skipped=${result.skipped} durationMs=${result.durationMs}`,
    );
    return result;
  }

  // One conditional UPDATE claims every free content at once and names the ones it got, so two
  // syncs on different Cloud Run instances never read the same content together (AC 13).
  private async claim(
    contentIds: string[],
    now: Date,
    until: Date,
  ): Promise<Set<string>> {
    if (contentIds.length === 0) return new Set();
    const rows = await this.prisma.$queryRaw<{ id: string }[]>(
      Prisma.sql`UPDATE contents SET performance_sync_lease_until = ${until} WHERE id = ANY(${contentIds}::uuid[]) AND (performance_sync_lease_until IS NULL OR performance_sync_lease_until <= ${now}) RETURNING id`,
    );
    return new Set(rows.map((row) => row.id));
  }

  // Only the claims this run made: a lease another run took after ours ran out stays.
  private async release(contentIds: string[], until: Date): Promise<void> {
    if (contentIds.length === 0) return;
    try {
      await this.prisma.contents.updateMany({
        where: {
          id: { in: contentIds },
          performance_sync_lease_until: until,
        },
        data: { performance_sync_lease_until: null },
      });
    } catch (error) {
      this.log.warn(
        `performance sync: releasing ${contentIds.length} content(s) failed (${nameOf(error)})`,
      );
    }
  }

  private async read(
    group: SyncGroup,
    deadlineMs: number,
  ): Promise<GroupResult> {
    const source = this.sources.get(group.platform);
    if (!source) return { outcome: 'unavailable' };
    try {
      const result = await withDeadline(
        source.read(
          group.creatorId,
          group.links.map(({ id, url }) => ({ id, url })),
        ),
        deadlineMs,
      );
      if (result.outcome === 'read') {
        for (const reading of result.readings) {
          if (reading.outcome === 'failed') {
            this.log.warn(
              `performance sync: link ${reading.linkId} (${group.platform}) failed: ${reading.reason}`,
            );
          }
        }
      }
      return result;
    } catch (error) {
      this.log.warn(
        `performance sync: reading ${group.platform} for creator ${group.creatorId} failed (${nameOf(error)})`,
      );
      return { outcome: 'error' };
    }
  }

  // Never rejects: a group's read or save failing is that group's outcome, not the run's.
  private async syncGroup(
    group: SyncGroup,
    deadlineMs: number,
  ): Promise<LinkOutcome[]> {
    const outcomes = outcomesFor(
      group,
      await this.read(group, deadlineMs),
      this.now(),
    );
    const writes = outcomes.filter((outcome) => outcome.write !== null);
    if (writes.length === 0) return outcomes;

    let counts: Prisma.BatchPayload[];
    try {
      // One batch per group; each write lands only on the state it was read in, so a manual
      // entry or a replaced link landing meanwhile wins.
      counts = await this.prisma.$transaction(
        writes.map((outcome) =>
          this.prisma.content_links.updateMany({
            where: { id: outcome.linkId, data_state: outcome.storedState },
            data: outcome.write as LinkWrite,
          }),
        ),
      );
    } catch (error) {
      this.log.warn(
        `performance sync: saving ${group.platform} links of creator ${group.creatorId} failed (${nameOf(error)})`,
      );
      return outcomes.map((outcome) => ({ ...outcome, synced: false }));
    }
    const unchanged = new Set(
      writes
        .filter((_, index) => counts[index].count === 0)
        .map((outcome) => outcome.linkId),
    );
    const landed = outcomes.map((outcome) =>
      unchanged.has(outcome.linkId) ? { ...outcome, synced: false } : outcome,
    );
    await this.recordReplacements(landed);
    return landed;
  }

  // After the numbers landed, so a link another change got to first records nothing. The numbers
  // are the sync's job and already saved: a lost timeline step is logged, not a failed link.
  private async recordReplacements(
    outcomes: readonly LinkOutcome[],
  ): Promise<void> {
    const replaced = outcomes.filter(
      (outcome): outcome is LinkOutcome & { replacedManual: ManualReplacement } =>
        outcome.synced && outcome.replacedManual !== undefined,
    );
    if (replaced.length === 0) return;
    const occurredAt = this.now();
    const data = replaced.map(({ replacedManual, contentId, platform }) => ({
      content_id: contentId,
      event_type: 'Performance Replaced',
      actor_name: SYSTEM_ACTOR_NAME,
      actor_role: 'system',
      actor_user_id: null,
      occurred_at: occurredAt,
      event_data: {
        platform,
        before: { ...replacedManual.before, state: 'manual' },
        after: { ...replacedManual.after, state: 'synced' },
      },
    }));
    try {
      await this.prisma.content_events.createMany({ data });
    } catch (error) {
      this.log.warn(
        `performance sync: recording ${data.length} replaced link(s) failed (${nameOf(error)})`,
      );
    }
  }
}
