import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PerformanceSource, SourceResult } from '../ports.js';
import {
  CONTRACT_DEADLINE_MS,
  GROUP_DEADLINE_MS,
  LEASE_MS,
  PerformanceSyncService,
  type PerformanceSyncClient,
  type SyncLog,
} from './performance-sync.service.js';
import { SYNC_LINK_SELECT, type SyncLinkRow } from './sync-selection.js';

const STARTED = new Date('2026-11-03T19:00:00.000Z'); // 02:00 WIB
const CREATOR_A = '0f9c2f5e-6b1a-4f3e-9a51-3c1d2e4b5a60';
const CREATOR_B = '6a1d0c9e-2b3f-4a5d-8e7f-9c0b1a2d3e4f';
const METRICS = { views: 12400, likes: 830, comments: 41, shares: null };

function row(
  id: string,
  contentId: string,
  platform: 'instagram' | 'tiktok' = 'tiktok',
  creator = CREATOR_A,
  data_state: SyncLinkRow['data_state'] = 'waiting',
): SyncLinkRow {
  return {
    id,
    url: `https://example.test/${id}`,
    platform,
    data_state,
    views: null,
    likes: null,
    comments: null,
    shares: null,
    content_id: contentId,
    contents: { contracts: { creator_id: creator } },
  };
}

interface Stub {
  client: PerformanceSyncClient;
  findMany: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
  transaction: ReturnType<typeof vi.fn>;
  queryRaw: ReturnType<typeof vi.fn>;
  findContent: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
  createEvents: ReturnType<typeof vi.fn>;
}

/** Prisma as far as the sync touches it. Every content asked for is claimed unless named. */
function stub(
  rows: SyncLinkRow[],
  options: { leasedElsewhere?: string[]; content?: unknown } = {},
): Stub {
  const leased = new Set(options.leasedElsewhere ?? []);
  const findMany = vi.fn().mockResolvedValue(rows);
  // Each update is a query Prisma would run inside the batch; the stub keeps its arguments.
  const updateMany = vi.fn((args: unknown) => ({ update: args }));
  const transaction = vi.fn(async (operations: unknown[]) =>
    operations.map(() => ({ count: 1 })),
  );
  const queryRaw = vi.fn(async (query: Prisma.Sql) => {
    const ids = query.values[1] as string[];
    return ids.filter((id) => !leased.has(id)).map((id) => ({ id }));
  });
  const findContent = vi.fn().mockResolvedValue(
    'content' in options
      ? options.content
      : {
          status: 'link_submitted',
          contracts: { invoice: null },
          content_links: [{ platform: 'tiktok' }, { platform: 'instagram' }],
        },
  );
  const release = vi.fn().mockResolvedValue({ count: 1 });
  const createEvents = vi.fn().mockResolvedValue({ count: 1 });
  const client = {
    content_links: { findMany, updateMany },
    contents: { findUnique: findContent, updateMany: release },
    content_events: { createMany: createEvents },
    $queryRaw: queryRaw,
    $transaction: transaction,
  } as unknown as PerformanceSyncClient;
  return {
    client,
    findMany,
    updateMany,
    transaction,
    queryRaw,
    findContent,
    release,
    createEvents,
  };
}

function source(
  platform: 'instagram' | 'tiktok',
  answer: (
    creatorId: string,
    links: readonly { id: string }[],
  ) => Promise<SourceResult>,
) {
  return { platform, read: vi.fn(answer) } satisfies PerformanceSource;
}

/** A source that reads every link it is given as synced. */
function syncing(platform: 'instagram' | 'tiktok') {
  return source(platform, async (_, links) => ({
    outcome: 'read',
    readings: links.map((link) => ({
      linkId: link.id,
      outcome: 'synced' as const,
      metrics: METRICS,
    })),
  }));
}

function log() {
  return {
    log: vi.fn<(message: string) => void>(),
    warn: vi.fn<(message: string) => void>(),
  } satisfies SyncLog;
}

/** A clock that moves on 1.5 s each time it is read, so a run has a duration. */
function clock() {
  let ms = STARTED.getTime() - 1500;
  return () => new Date((ms += 1500));
}

/** The writes each transaction carried, by link id. */
function writesOf(s: Stub) {
  return s.updateMany.mock.calls.map(
    ([args]) =>
      args as {
        where: { id: string; data_state: string };
        data: Record<string, unknown>;
      },
  );
}

describe('PerformanceSyncService', () => {
  // PBI-27 AC 17: the timeline says the platform took over from numbers an admin typed in.
  describe('recording manual numbers the platform replaced', () => {
    const typed = { views: 100, likes: 5, comments: 2, shares: 1 };
    const manualRow = () => ({
      ...row('a-tt-1', 'content-1', 'tiktok', CREATOR_A, 'manual'),
      ...typed,
    });

    it('writes one system event with the old and new values', async () => {
      const s = stub([manualRow()]);
      const service = new PerformanceSyncService(
        s.client,
        [syncing('tiktok')],
        log(),
        clock(),
      );

      await service.syncAll();

      expect(s.createEvents).toHaveBeenCalledTimes(1);
      const [{ data }] = s.createEvents.mock.calls[0];
      expect(data).toEqual([
        expect.objectContaining({
          content_id: 'content-1',
          event_type: 'Performance Replaced',
          actor_name: 'Sistem',
          actor_role: 'system',
          actor_user_id: null,
          event_data: {
            platform: 'tiktok',
            before: { ...typed, state: 'manual' },
            after: expect.objectContaining({ state: 'synced' }),
          },
        }),
      ]);
    });

    it('writes nothing when a change landed first and the numbers stayed', async () => {
      const s = stub([manualRow()]);
      s.transaction.mockResolvedValue([{ count: 0 }]);
      const service = new PerformanceSyncService(
        s.client,
        [syncing('tiktok')],
        log(),
        clock(),
      );

      await service.syncAll();

      expect(s.createEvents).not.toHaveBeenCalled();
    });

    it('writes nothing for a link that held no manual numbers', async () => {
      const s = stub([row('a-tt-1', 'content-1')]);
      const service = new PerformanceSyncService(
        s.client,
        [syncing('tiktok')],
        log(),
        clock(),
      );

      await service.syncAll();

      expect(s.createEvents).not.toHaveBeenCalled();
    });

    it('keeps the synced numbers and warns when the event cannot be saved', async () => {
      const s = stub([manualRow()]);
      s.createEvents.mockRejectedValue(new TypeError('secret detail'));
      const out = log();
      const service = new PerformanceSyncService(
        s.client,
        [syncing('tiktok')],
        out,
        clock(),
      );

      await expect(service.syncAll()).resolves.toMatchObject({ succeeded: 1 });
      expect(out.warn).toHaveBeenCalledWith(
        'performance sync: recording 1 replaced link(s) failed (TypeError)',
      );
    });
  });

  describe('syncAll (the 02:00 WIB run)', () => {
    it('reads only syncable links, with no token column, and only once per creator per platform (AC 4, 5)', async () => {
      const s = stub([
        row('a-tt-1', 'c1'),
        row('a-ig-1', 'c1', 'instagram'),
        row('a-tt-2', 'c2'),
        row('b-tt-1', 'c3', 'tiktok', CREATOR_B),
      ]);
      const tiktok = syncing('tiktok');
      const instagram = syncing('instagram');
      const service = new PerformanceSyncService(
        s.client,
        [tiktok, instagram],
        log(),
        clock(),
      );

      await service.syncAll();

      expect(s.findMany).toHaveBeenCalledWith({
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
        where: {
          platform: { not: null },
          contents: {
            status: 'link_submitted',
            contracts: {
              OR: [
                { invoice: { is: null } },
                { invoice: { is: { status: 'running' } } },
              ],
            },
          },
        },
        select: SYNC_LINK_SELECT,
      });
      expect(tiktok.read.mock.calls).toEqual([
        [
          CREATOR_A,
          [
            { id: 'a-tt-1', url: 'https://example.test/a-tt-1' },
            { id: 'a-tt-2', url: 'https://example.test/a-tt-2' },
          ],
        ],
        [CREATOR_B, [{ id: 'b-tt-1', url: 'https://example.test/b-tt-1' }]],
      ]);
      expect(instagram.read.mock.calls).toEqual([
        [CREATOR_A, [{ id: 'a-ig-1', url: 'https://example.test/a-ig-1' }]],
      ]);
    });

    it("saves each link's numbers and state against the state it was read in, one transaction per group (AC 3, 4)", async () => {
      const s = stub([
        row('a-tt-1', 'c1'),
        row('a-tt-2', 'c2', 'tiktok', CREATOR_A, 'manual'),
      ]);
      const service = new PerformanceSyncService(
        s.client,
        [syncing('tiktok')],
        log(),
        clock(),
      );

      await service.syncAll();

      expect(s.transaction).toHaveBeenCalledTimes(1);
      expect(writesOf(s)).toEqual([
        {
          where: { id: 'a-tt-1', data_state: 'waiting' },
          data: {
            views: 12400,
            likes: 830,
            comments: 41,
            data_state: 'synced',
            // The moment the platform answered: the clock's second reading, after the run began.
            last_synced_at: new Date(STARTED.getTime() + 1500),
            manual_by: null,
            manual_at: null,
          },
        },
        {
          where: { id: 'a-tt-2', data_state: 'manual' },
          data: expect.objectContaining({ data_state: 'synced' }),
        },
      ]);
      expect(s.transaction.mock.calls[0][0]).toEqual(
        s.updateMany.mock.results.map((result) => result.value),
      );
    });

    it("claims every content it reads until the run's lease runs out, skipping ones another sync holds (AC 13)", async () => {
      const s = stub([
        row('a-tt-1', 'c1'),
        row('a-tt-2', 'c2'),
        row('a-tt-3', 'c1'),
      ]);
      const service = new PerformanceSyncService(
        s.client,
        [syncing('tiktok')],
        log(),
        clock(),
      );

      await service.syncAll();

      expect(s.queryRaw).toHaveBeenCalledTimes(1);
      const [query] = s.queryRaw.mock.calls[0] as [Prisma.Sql];
      expect(query.sql).toMatch(
        /UPDATE contents SET performance_sync_lease_until = \? WHERE id = ANY\(\?::uuid\[\]\) AND \(performance_sync_lease_until IS NULL OR performance_sync_lease_until <= \?\) RETURNING id/,
      );
      expect(query.values).toEqual([
        new Date(STARTED.getTime() + LEASE_MS.all),
        ['c1', 'c2'],
        STARTED,
      ]);
    });

    it('lets go of exactly the contents it claimed with its own lease once done', async () => {
      const s = stub([row('a-tt-1', 'c1'), row('a-tt-2', 'c2')], {
        leasedElsewhere: ['c2'],
      });
      const service = new PerformanceSyncService(
        s.client,
        [syncing('tiktok')],
        log(),
        clock(),
      );

      await service.syncAll();

      expect(s.release).toHaveBeenCalledWith({
        where: {
          id: { in: ['c1'] },
          performance_sync_lease_until: new Date(
            STARTED.getTime() + LEASE_MS.all,
          ),
        },
        data: { performance_sync_lease_until: null },
      });
    });

    it('leaves a content another sync holds untouched and reports it skipped', async () => {
      const s = stub([row('a-tt-1', 'c1'), row('a-tt-2', 'c2')], {
        leasedElsewhere: ['c2'],
      });
      const tiktok = syncing('tiktok');
      const service = new PerformanceSyncService(
        s.client,
        [tiktok],
        log(),
        clock(),
      );

      const report = await service.syncAll();

      expect(tiktok.read).toHaveBeenCalledWith(CREATOR_A, [
        { id: 'a-tt-1', url: 'https://example.test/a-tt-1' },
      ]);
      expect(report).toMatchObject({
        processed: 1,
        succeeded: 1,
        failed: 0,
        skipped: 1,
      });
    });

    it('logs links processed, succeeded, failed and skipped, and how long the run took', async () => {
      const s = stub([
        row('a-tt-1', 'c1'),
        row('b-tt-1', 'c2', 'tiktok', CREATOR_B),
      ]);
      const tiktok = source('tiktok', async (creatorId, links) => ({
        outcome: 'read',
        readings: links.map((link) =>
          creatorId === CREATOR_A
            ? { linkId: link.id, outcome: 'synced', metrics: METRICS }
            : { linkId: link.id, outcome: 'not_found' },
        ),
      }));
      const out = log();
      const service = new PerformanceSyncService(
        s.client,
        [tiktok],
        out,
        clock(),
      );

      const report = await service.syncAll();

      expect(report).toEqual({
        processed: 2,
        succeeded: 1,
        failed: 1,
        skipped: 0,
        durationMs: expect.any(Number),
      });
      // The clock moves 1.5 s a reading: the start, one per group saved, and the end.
      expect(report.durationMs).toBe(4500);
      expect(out.log).toHaveBeenCalledWith(
        `performance sync all: processed=2 succeeded=1 failed=1 skipped=0 durationMs=${report.durationMs}`,
      );
    });

    it('has nothing to claim, read or write when no link is syncable', async () => {
      const s = stub([]);
      const tiktok = syncing('tiktok');
      const service = new PerformanceSyncService(
        s.client,
        [tiktok],
        log(),
        clock(),
      );

      expect(await service.syncAll()).toMatchObject({
        processed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
      });
      expect(s.queryRaw).not.toHaveBeenCalled();
      expect(tiktok.read).not.toHaveBeenCalled();
      expect(s.transaction).not.toHaveBeenCalled();
      expect(s.release).not.toHaveBeenCalled();
    });

    describe('one failing link never stops the others (AC 6)', () => {
      it('marks the group of a source that threw "Gagal sinkron" and syncs every other group', async () => {
        const s = stub([
          row('a-tt-1', 'c1'),
          row('b-tt-1', 'c2', 'tiktok', CREATOR_B),
        ]);
        const tiktok = source('tiktok', async (creatorId, links) => {
          if (creatorId === CREATOR_A) {
            throw new Error('access_token=secret-token leaked in a message');
          }
          return syncing('tiktok').read(creatorId, links);
        });
        const out = log();
        const service = new PerformanceSyncService(
          s.client,
          [tiktok],
          out,
          clock(),
        );

        const report = await service.syncAll();

        expect(writesOf(s)).toEqual([
          {
            where: { id: 'a-tt-1', data_state: 'waiting' },
            data: { data_state: 'sync_failed' },
          },
          {
            where: { id: 'b-tt-1', data_state: 'waiting' },
            data: expect.objectContaining({ data_state: 'synced' }),
          },
        ]);
        expect(report).toMatchObject({ succeeded: 1, failed: 1 });
        // The error's name only: a message may carry what a platform or a driver put in it.
        expect(out.warn).toHaveBeenCalledWith(
          `performance sync: reading tiktok for creator ${CREATOR_A} failed (Error)`,
        );
        expect(JSON.stringify(out.warn.mock.calls)).not.toContain(
          'secret-token',
        );
      });

      it('gives up on a source that has not answered within the deadline and retries it next run', async () => {
        vi.useFakeTimers();
        try {
          const s = stub([row('a-tt-1', 'c1')]);
          const silent = source('tiktok', () => new Promise(() => undefined));
          const out = log();
          const service = new PerformanceSyncService(
            s.client,
            [silent],
            out,
            clock(),
          );

          const pending = service.syncAll();
          await vi.advanceTimersByTimeAsync(GROUP_DEADLINE_MS);
          const report = await pending;

          expect(writesOf(s)).toEqual([
            {
              where: { id: 'a-tt-1', data_state: 'waiting' },
              data: { data_state: 'sync_failed' },
            },
          ]);
          expect(report).toMatchObject({ failed: 1 });
          expect(out.warn).toHaveBeenCalledWith(
            `performance sync: reading tiktok for creator ${CREATOR_A} failed (DeadlineExceeded)`,
          );
        } finally {
          vi.useRealTimers();
        }
      });

      it("logs why each link failed, with the source's own safe reason", async () => {
        const s = stub([row('a-tt-1', 'c1')]);
        const tiktok = source('tiktok', async () => ({
          outcome: 'read',
          readings: [
            {
              linkId: 'a-tt-1',
              outcome: 'failed',
              reason: 'video/query: TikTok answered 503',
            },
          ],
        }));
        const out = log();
        const service = new PerformanceSyncService(
          s.client,
          [tiktok],
          out,
          clock(),
        );

        await service.syncAll();

        expect(out.warn).toHaveBeenCalledWith(
          'performance sync: link a-tt-1 (tiktok) failed: video/query: TikTok answered 503',
        );
      });

      it.each([
        [
          'synced or not found',
          async (_: string, links: readonly { id: string }[]) => ({
            outcome: 'read' as const,
            readings: [
              {
                linkId: links[0].id,
                outcome: 'synced' as const,
                metrics: METRICS,
              },
              { linkId: links[1].id, outcome: 'not_found' as const },
            ],
          }),
        ],
        ['disconnected', async () => ({ outcome: 'disconnected' as const })],
      ])(
        'warns about nothing when the links are %s: only a failure is worth a warning',
        async (_, answer) => {
          const s = stub([row('a-tt-1', 'c1'), row('a-tt-2', 'c2')]);
          const out = log();
          const service = new PerformanceSyncService(
            s.client,
            [source('tiktok', answer)],
            out,
            clock(),
          );

          await service.syncAll();

          expect(out.warn).not.toHaveBeenCalled();
        },
      );

      it('counts a group whose numbers could not be saved as failed, and still saves the other groups', async () => {
        const s = stub([
          row('a-tt-1', 'c1'),
          row('b-tt-1', 'c2', 'tiktok', CREATOR_B),
        ]);
        s.transaction
          .mockRejectedValueOnce(
            new Prisma.PrismaClientUnknownRequestError('row data', {
              clientVersion: '6',
            }),
          )
          .mockImplementation(async (operations: unknown[]) =>
            operations.map(() => ({ count: 1 })),
          );
        const out = log();
        const service = new PerformanceSyncService(
          s.client,
          [syncing('tiktok')],
          out,
          clock(),
        );

        const { notUpdated } = await service.syncContract('contract-1');

        expect(s.transaction).toHaveBeenCalledTimes(2);
        expect(notUpdated).toEqual([{ contentId: 'c1', platform: 'tiktok' }]);
        expect(out.warn).toHaveBeenCalledWith(
          `performance sync: saving tiktok links of creator ${CREATOR_A} failed (PrismaClientUnknownRequestError)`,
        );
        expect(s.release).toHaveBeenCalled();
      });

      it('counts a link whose state changed while it was read as not updated: the other write wins', async () => {
        const s = stub([row('a-tt-1', 'c1'), row('a-tt-2', 'c2')]);
        s.transaction.mockResolvedValue([{ count: 0 }, { count: 1 }]);
        const service = new PerformanceSyncService(
          s.client,
          [syncing('tiktok')],
          log(),
          clock(),
        );

        expect(await service.syncContract('contract-1')).toEqual({
          notUpdated: [{ contentId: 'c1', platform: 'tiktok' }],
        });
      });

      it('names an error that is not an Error without its contents', async () => {
        const s = stub([row('a-tt-1', 'c1')]);
        const tiktok = source('tiktok', () =>
          Promise.reject('token-in-a-string'),
        );
        const out = log();
        const service = new PerformanceSyncService(
          s.client,
          [tiktok],
          out,
          clock(),
        );

        await service.syncAll();

        expect(out.warn).toHaveBeenCalledWith(
          `performance sync: reading tiktok for creator ${CREATOR_A} failed (unknown error)`,
        );
      });
    });

    it('writes nothing for a platform no source reads in this environment, and counts its links failed', async () => {
      const s = stub([row('a-ig-1', 'c1', 'instagram'), row('a-tt-1', 'c1')]);
      const service = new PerformanceSyncService(
        s.client,
        [syncing('tiktok')],
        log(),
        clock(),
      );

      const report = await service.syncAll();

      expect(writesOf(s).map((write) => write.where.id)).toEqual(['a-tt-1']);
      expect(report).toMatchObject({ succeeded: 1, failed: 1 });
    });

    it('skips the transaction when a group has nothing to write', async () => {
      const s = stub([row('a-tt-1', 'c1', 'tiktok', CREATOR_A, 'manual')]);
      const tiktok = source('tiktok', async () => ({
        outcome: 'disconnected',
      }));
      const service = new PerformanceSyncService(
        s.client,
        [tiktok],
        log(),
        clock(),
      );

      await service.syncAll();

      expect(s.transaction).not.toHaveBeenCalled();
    });

    it('still reports the run when letting go of its lease fails; the lease runs out by itself', async () => {
      const s = stub([row('a-tt-1', 'c1')]);
      s.release.mockRejectedValue(new Error('connection lost'));
      const out = log();
      const service = new PerformanceSyncService(
        s.client,
        [syncing('tiktok')],
        out,
        clock(),
      );

      expect(await service.syncAll()).toMatchObject({ succeeded: 1 });
      expect(out.warn).toHaveBeenCalledWith(
        'performance sync: releasing 1 content(s) failed (Error)',
      );
    });

    it("works with Nest's own logger and the real clock when none are given", async () => {
      const s = stub([]);
      const service = new PerformanceSyncService(s.client, []);

      await expect(service.syncAll()).resolves.toMatchObject({ processed: 0 });
      const logger = Reflect.get(service, 'log') as Logger & {
        context?: string;
      };
      expect(logger).toBeInstanceOf(Logger);
      expect(logger.context).toBe('PerformanceSync');
    });
  });

  describe('syncContent ("Sinkronkan Sekarang" and the table\'s "Sinkronkan", AC 12-13)', () => {
    it('syncs every link of that one content and names each platform it could not update', async () => {
      const s = stub([row('a-tt-1', 'c1'), row('a-ig-1', 'c1', 'instagram')]);
      const instagram = source('instagram', async (_, links) => ({
        outcome: 'read',
        readings: links.map((link) => ({
          linkId: link.id,
          outcome: 'not_found',
        })),
      }));
      const service = new PerformanceSyncService(
        s.client,
        [syncing('tiktok'), instagram],
        log(),
        clock(),
      );

      expect(await service.syncContent('c1')).toEqual({
        notUpdated: [{ platform: 'instagram' }],
      });
      expect(s.findContent).toHaveBeenCalledWith({
        where: { id: 'c1' },
        select: {
          status: true,
          contracts: { select: { invoice: { select: { status: true } } } },
          content_links: { select: { platform: true } },
        },
      });
      expect(s.findMany.mock.calls[0][0].where.contents.id).toBe('c1');
      const [query] = s.queryRaw.mock.calls[0] as [Prisma.Sql];
      expect(query.values[0]).toEqual(
        new Date(STARTED.getTime() + LEASE_MS.content),
      );
    });

    // SCRUM-282: a link card's Refresh reads only its own link, under the same claim on the
    // content, so it and "Sinkronkan Sekarang" never sync that content at the same time.
    it("syncs only one platform's link when a single link card asks for it", async () => {
      const s = stub([row('a-ig-1', 'c1', 'instagram')]);
      const service = new PerformanceSyncService(
        s.client,
        [syncing('tiktok'), syncing('instagram')],
        log(),
        clock(),
      );

      expect(await service.syncContent('c1', 'instagram')).toEqual({
        notUpdated: [],
      });
      const { where } = s.findMany.mock.calls[0][0];
      expect(where.platform).toBe('instagram');
      expect(where.contents.id).toBe('c1');
      const [query] = s.queryRaw.mock.calls[0] as [Prisma.Sql];
      expect(query.values[0]).toEqual(
        new Date(STARTED.getTime() + LEASE_MS.content),
      );
    });

    it('answers 409 while that content is already syncing, reading and writing nothing (AC 13)', async () => {
      const s = stub([row('a-tt-1', 'c1')], { leasedElsewhere: ['c1'] });
      const tiktok = syncing('tiktok');
      const service = new PerformanceSyncService(
        s.client,
        [tiktok],
        log(),
        clock(),
      );

      const refusal = await service.syncContent('c1').catch((error) => error);

      expect(refusal).toBeInstanceOf(ConflictException);
      expect((refusal as ConflictException).getResponse()).toEqual({
        code: 'SYNC_RUNNING',
        message: 'Konten ini sedang disinkronkan',
      });
      expect(tiktok.read).not.toHaveBeenCalled();
      expect(s.transaction).not.toHaveBeenCalled();
    });

    it('answers 404 for a content that does not exist', async () => {
      const s = stub([], { content: null });
      const service = new PerformanceSyncService(s.client, [], log(), clock());

      const refusal = await service.syncContent('c9').catch((error) => error);

      expect(refusal).toBeInstanceOf(NotFoundException);
      expect((refusal as NotFoundException).getResponse()).toEqual({
        code: 'CONTENT_NOT_FOUND',
        message: 'Konten tidak ditemukan',
      });
      expect(s.findMany).not.toHaveBeenCalled();
    });

    // SCRUM-282 review: a card's Refresh for a platform the content has no link on is not a
    // success; it answers 404 like the manual-entry route does.
    it('answers 404 LINK_NOT_FOUND for a platform that content has no link on, claiming and reading nothing', async () => {
      const s = stub([], {
        content: {
          status: 'link_submitted',
          contracts: { invoice: null },
          content_links: [{ platform: 'tiktok' }],
        },
      });
      const service = new PerformanceSyncService(
        s.client,
        [syncing('instagram')],
        log(),
        clock(),
      );

      const refusal = await service
        .syncContent('c1', 'instagram')
        .catch((error) => error);

      expect(refusal).toBeInstanceOf(NotFoundException);
      expect((refusal as NotFoundException).getResponse()).toEqual({
        code: 'LINK_NOT_FOUND',
        message: 'Link tidak ditemukan',
      });
      expect(s.queryRaw).not.toHaveBeenCalled();
      expect(s.findMany).not.toHaveBeenCalled();
    });

    it.each([
      [
        'its invoice is finalized (AC 5)',
        {
          status: 'link_submitted',
          contracts: { invoice: { status: 'finalized' } },
        },
      ],
      [
        'it has no link yet (AC 4)',
        { status: 'draft_review', contracts: { invoice: null } },
      ],
    ])('answers 409 SYNC_NOT_ALLOWED when %s', async (_, content) => {
      const s = stub([], { content });
      const service = new PerformanceSyncService(s.client, [], log(), clock());

      const refusal = await service.syncContent('c1').catch((error) => error);

      expect(refusal).toBeInstanceOf(ConflictException);
      expect((refusal as ConflictException).getResponse()).toEqual({
        code: 'SYNC_NOT_ALLOWED',
        message: 'Konten ini tidak disinkronkan lagi',
      });
      expect(s.findMany).not.toHaveBeenCalled();
    });
  });

  describe('syncContract (the last sync before Finalize)', () => {
    it("syncs one contract's links within Finalize's 20 s and names every link it left as it was", async () => {
      const s = stub([row('a-tt-1', 'c1'), row('a-tt-2', 'c2')], {
        leasedElsewhere: ['c2'],
      });
      const service = new PerformanceSyncService(
        s.client,
        [syncing('tiktok')],
        log(),
        clock(),
      );

      expect(await service.syncContract('contract-1')).toEqual({
        notUpdated: [{ contentId: 'c2', platform: 'tiktok' }],
      });
      expect(s.findMany.mock.calls[0][0].where.contents.contracts.id).toBe(
        'contract-1',
      );
      const [query] = s.queryRaw.mock.calls[0] as [Prisma.Sql];
      expect(query.values[0]).toEqual(
        new Date(STARTED.getTime() + LEASE_MS.contract),
      );
    });

    it("stops waiting for a source at Finalize's deadline, not the daily run's", async () => {
      vi.useFakeTimers();
      try {
        const s = stub([row('a-tt-1', 'c1')]);
        const silent = source('tiktok', () => new Promise(() => undefined));
        const service = new PerformanceSyncService(
          s.client,
          [silent],
          log(),
          clock(),
        );

        const pending = service.syncContract('contract-1');
        await vi.advanceTimersByTimeAsync(CONTRACT_DEADLINE_MS);

        expect(await pending).toEqual({
          notUpdated: [{ contentId: 'c1', platform: 'tiktok' }],
        });
        expect(CONTRACT_DEADLINE_MS).toBeLessThan(GROUP_DEADLINE_MS);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it('holds each lease longer than its run can take, so no second sync slips in mid-run', () => {
    expect(LEASE_MS).toEqual({
      all: 30 * 60_000,
      content: 2 * 60_000,
      contract: 60_000,
    });
    expect(LEASE_MS.content).toBeGreaterThan(GROUP_DEADLINE_MS);
    expect(LEASE_MS.contract).toBeGreaterThan(CONTRACT_DEADLINE_MS);
  });
});
