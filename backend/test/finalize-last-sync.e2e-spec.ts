import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import type {
  PerformanceSource,
  SourceResult,
} from '../src/performance/ports.js';
import { PERFORMANCE_SOURCES } from '../src/performance/sync/performance-sync.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { RateFormulaService } from '../src/rate-formula/rate-formula.service.js';
import { day } from './days.js';
import { storedLink } from './links.js';
import { as, signInAsAdmin } from './sessions.js';

// PBI-28 28.2 (SCRUM-236) against the real schema and 27.4's real sync: Finalize's last sync, the
// links it reports, the frozen links, and what PostgreSQL's locks and isolation make of a write
// landing while Finalize runs. Only the platform behind the sync is a stand-in.

const MARKER = 'e2e-finalize-last-sync';
const FORMULA = {
  latePenaltyPerDay: 50_000,
  maxPenaltyDays: 3,
  specificBonus: 100_000,
  performanceBonus: {
    instagram: {
      metric: 'views',
      tiers: [{ threshold: 10_000, bonus: 150_000 }],
    },
    tiktok: { metric: 'views', tiers: [{ threshold: 10_000, bonus: 150_000 }] },
  },
} as const;
const SYNCED = { views: 12_400, likes: 830, comments: 41, shares: null };
let videoSeq = 7700000000000000000n;
const tiktok = () => `https://www.tiktok.com/@tofly/video/${(videoSeq += 1n)}`;
let postSeq = 0;
const instagram = () =>
  `https://www.instagram.com/reel/${MARKER}${(postSeq += 1)}/`;

type Answer = (
  creatorId: string,
  links: readonly { id: string }[],
) => Promise<SourceResult>;

const synced: Answer = async (_, links) => ({
  outcome: 'read',
  readings: links.map((link) => ({
    linkId: link.id,
    outcome: 'synced',
    metrics: SYNCED,
  })),
});

describe('Finalize with its last sync (e2e, PBI-28 28.2)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: ReturnType<typeof as>;
  let adminUser: string;
  let savedFormula: Awaited<ReturnType<RateFormulaService['read']>>;
  let answer: Answer = synced;
  const tiktokSource: PerformanceSource = {
    platform: 'tiktok',
    read: (creatorId, links) => answer(creatorId, links),
  };

  /** A creator whose one contract ended yesterday, with one delivered content per given link. */
  async function endedContract(
    name: string,
    links: {
      platform: 'tiktok' | 'instagram';
      numbers?: Record<string, unknown>;
    }[],
  ) {
    const user = await prisma.users.create({
      data: {
        email: `${MARKER}-${name}@example.com`,
        creators: {
          create: {
            first_name: MARKER,
            last_name: name,
            contracts: {
              create: {
                start_date: day(-40),
                end_date: day(-1),
                contract_type: 'regular',
                days_between: 14,
                content_quota: links.length,
                fixed_rate: 1_000_000,
              },
            },
          },
        },
      },
      include: { creators: { include: { contracts: true } } },
    });
    const contractId = user.creators!.contracts[0].id;
    const contents = [];
    for (const [index, link] of links.entries()) {
      const url = link.platform === 'tiktok' ? tiktok() : instagram();
      contents.push(
        await prisma.contents.create({
          data: {
            contract_id: contractId,
            name: `${MARKER} ${name} ${index + 1}`,
            type: 'evergreen',
            deadline: day(-10 + index),
            status: 'link_submitted',
            video_submitted_at: day(-12 + index),
            content_links: {
              create: [
                {
                  ...storedLink(url, day(-12 + index), user.id, link.platform),
                  ...link.numbers,
                },
              ],
            },
          },
          include: { content_links: true },
        }),
      );
    }
    return { contractId, contents, userId: user.id };
  }

  const finalize = (contractId: string) =>
    admin
      .post(`/invoices/${contractId}/finalize`)
      .send({ acceptPendingBonus: true });

  const storedSnapshot = async (contractId: string) =>
    (
      await prisma.invoices.findUniqueOrThrow({
        where: { contract_id: contractId },
        select: { snapshot: true },
      })
    ).snapshot as Record<string, unknown>;

  /** Waits until a backend is blocked on a lock while running a statement containing `text`. */
  async function blockedOn(text: string) {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const rows = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS n FROM pg_stat_activity
        WHERE wait_event_type = 'Lock' AND query LIKE ${`%${text}%`}`;
      if (rows[0].n > 0n) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`nothing blocked on ${text}`);
  }

  beforeAll(async () => {
    vi.stubEnv('DEV_AUTH_ENABLED', '');
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PERFORMANCE_SOURCES)
      .useValue([tiktokSource])
      .compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);

    admin = as(app, await signInAsAdmin(app, prisma, MARKER));
    adminUser = (
      await prisma.users.findUniqueOrThrow({
        where: { email: `${MARKER}-signed-in-admin@example.com` },
        select: { id: true },
      })
    ).id;
    savedFormula = await app.get(RateFormulaService).read();
    await admin.put('/rate-formula').send(FORMULA).expect(200);
  });

  beforeEach(() => {
    answer = synced;
  });

  afterAll(async () => {
    if (savedFormula?.configured) {
      const { configured: _, updatedAt: __, ...formula } = savedFormula;
      await app
        .get(RateFormulaService)
        .replace(
          formula as Parameters<RateFormulaService['replace']>[0],
          undefined,
        );
    } else {
      await prisma.$executeRaw`delete from performance_bonus_tiers`;
      await prisma.$executeRaw`delete from performance_bonus_metrics`;
      await prisma.$executeRaw`delete from rate_formula`;
    }
    await prisma.creators.deleteMany({ where: { first_name: MARKER } });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARKER } } });
    await app.close();
    vi.unstubAllEnvs();
  });

  it('syncs first, then freezes each link with the numbers, source, state and time the sync saved (AC 7, 10)', async () => {
    const { contractId, contents } = await endedContract('fast', [
      { platform: 'tiktok' },
    ]);

    const response = await finalize(contractId).expect(201);

    const link = await prisma.content_links.findFirstOrThrow({
      where: { content_id: contents[0].id },
    });
    expect(link).toMatchObject({ ...SYNCED, data_state: 'synced' });
    const frozen = {
      contentId: contents[0].id,
      contentName: contents[0].name,
      platform: 'tiktok',
      ...SYNCED,
      source: 'synced',
      state: 'synced',
      lastSyncedAt: link.last_synced_at!.toISOString(),
    };
    expect(response.body.lastSync).toEqual({ status: 'done', notUpdated: [] });
    expect(response.body.snapshot.performanceLinks).toEqual([frozen]);
    expect((await storedSnapshot(contractId)).performanceLinks).toEqual([
      frozen,
    ]);
  });

  // 27.4 keeps an admin's numbers and their manual state when the platform fails to read them.
  it('names a link the platform could not read, freezes the manual numbers it kept, and still finalizes (AC 8)', async () => {
    answer = async (_, links) => ({
      outcome: 'read',
      readings: links.map((link) => ({
        linkId: link.id,
        outcome: 'failed',
        reason: 'rate limited',
      })),
    });
    const typedAt = new Date('2026-10-31T03:30:00.000Z');
    const { contractId, contents } = await endedContract('failing', [
      {
        platform: 'tiktok',
        numbers: {
          views: 9_000,
          likes: 10,
          data_state: 'manual',
          manual_by: adminUser,
          manual_at: typedAt,
        },
      },
    ]);

    const response = await finalize(contractId).expect(201);

    expect(response.body.lastSync).toEqual({
      status: 'done',
      notUpdated: [
        {
          contentId: contents[0].id,
          contentName: contents[0].name,
          platform: 'tiktok',
          state: 'manual',
        },
      ],
    });
    expect(response.body.snapshot.performanceLinks).toEqual([
      expect.objectContaining({
        views: 9_000,
        likes: 10,
        source: 'manual',
        state: 'manual',
        lastSyncedAt: null,
      }),
    ]);
  });

  it('names a link no platform source can read, with its state as frozen', async () => {
    const { contractId, contents } = await endedContract('unreadable', [
      { platform: 'instagram' },
    ]);

    const response = await finalize(contractId).expect(201);

    expect(response.body.lastSync.notUpdated).toEqual([
      {
        contentId: contents[0].id,
        contentName: contents[0].name,
        platform: 'instagram',
        state: 'waiting',
      },
    ]);
    expect(response.body.snapshot.performanceLinks[0]).toMatchObject({
      views: null,
      source: null,
      state: 'waiting',
    });
  });

  // OWASP A06:2025 Insecure Design: while the platform is still answering, the contract row is
  // free, so every other command on the contract goes on (AC 7).
  it('holds no lock on the contract while the platform is still answering', async () => {
    const { contractId } = await endedContract('slow', [
      { platform: 'tiktok' },
    ]);
    let reached!: () => void;
    const reading = new Promise<void>((resolve) => (reached = resolve));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    answer = async (creatorId, links) => {
      reached();
      await gate;
      return synced(creatorId, links);
    };

    const pending = finalize(contractId).then((r) => r);
    await reading;
    const free = await prisma.$transaction(
      async (tx) =>
        tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM contracts WHERE id = ${contractId}::uuid FOR UPDATE NOWAIT`,
    );
    release();

    expect(free).toHaveLength(1);
    expect((await pending).status).toBe(201);
  });

  // OWASP A08:2025 Software or Data Integrity Failures: what was frozen stays frozen (AC 11).
  it('keeps the frozen numbers when the live ones change after Finalize, as a late sync would', async () => {
    const { contractId, contents } = await endedContract('late', [
      { platform: 'tiktok' },
    ]);
    await finalize(contractId).expect(201);
    const before = await storedSnapshot(contractId);

    await prisma.content_links.updateMany({
      where: { content_id: contents[0].id },
      data: {
        views: 99_999,
        likes: 1,
        data_state: 'synced',
        last_synced_at: new Date(),
      },
    });

    expect(await storedSnapshot(contractId)).toEqual(before);
    const view = await admin.get('/invoices').expect(200);
    expect(JSON.stringify(view.body)).not.toContain('99999');
  });

  describe('a write landing while Finalize runs (Read Committed, MVCC)', () => {
    // A link write that waits for nothing Finalize holds: no platform source reads Instagram here,
    // so the sync writes nothing and only this test's own writer touches the row.
    it('waits for an uncommitted write to the link and freezes the number it committed', async () => {
      const { contractId, contents } = await endedContract('racing', [
        {
          platform: 'instagram',
          numbers: {
            views: 9_000,
            data_state: 'manual',
            manual_by: adminUser,
            manual_at: new Date(),
          },
        },
      ]);
      const writer = new PrismaClient();
      let commit!: () => void;
      const committed = new Promise<void>((resolve) => (commit = resolve));
      const written = writer.$transaction(
        async (tx) => {
          await tx.content_links.updateMany({
            where: { content_id: contents[0].id },
            data: { views: 12_400 },
          });
          await committed;
        },
        { timeout: 20_000 },
      );

      try {
        const pending = finalize(contractId).then((r) => r);
        await blockedOn('FOR SHARE OF l');
        commit();
        await written;
        const response = await pending;

        expect(response.status).toBe(201);
        expect(response.body.snapshot.performanceLinks[0].views).toBe(12_400);
      } finally {
        commit();
        await written.catch(() => undefined);
        await writer.$disconnect();
      }
    });

    // Learning 3: why Finalize stays in Read Committed. Repeatable Read takes its snapshot at the
    // first statement, here the lock wait itself, so it reads past a write committed meanwhile.
    it.each([
      ['ReadCommitted', 12_400],
      ['RepeatableRead', 9_000],
    ] as const)(
      'reads, under %s, a link written while the reader waited on the contract lock as %i',
      async (isolationLevel, seen) => {
        const { contractId, contents } = await endedContract(
          `iso-${isolationLevel}`,
          [{ platform: 'instagram', numbers: { views: 9_000 } }],
        );
        const linkId = contents[0].content_links[0].id;
        const writer = new PrismaClient();
        const reader = new PrismaClient();
        let commit!: () => void;
        const committed = new Promise<void>((resolve) => (commit = resolve));
        let locked!: () => void;
        const holding = new Promise<void>((resolve) => (locked = resolve));
        const written = writer.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT id FROM contracts WHERE id = ${contractId}::uuid FOR UPDATE`;
            await tx.content_links.update({
              where: { id: linkId },
              data: { views: 12_400 },
            });
            locked();
            await committed;
          },
          { timeout: 20_000 },
        );

        try {
          await holding;
          const read = reader.$transaction(
            async (tx) => {
              await tx.$queryRaw`SELECT id FROM contracts WHERE id = ${contractId}::uuid FOR UPDATE /* reader */`;
              return tx.content_links.findUniqueOrThrow({
                where: { id: linkId },
                select: { views: true },
              });
            },
            { isolationLevel, timeout: 20_000 },
          );
          await blockedOn('/* reader */');
          commit();
          await written;

          expect((await read).views).toBe(seen);
        } finally {
          commit();
          await written.catch(() => undefined);
          await writer.$disconnect();
          await reader.$disconnect();
        }
      },
    );
  });
});
