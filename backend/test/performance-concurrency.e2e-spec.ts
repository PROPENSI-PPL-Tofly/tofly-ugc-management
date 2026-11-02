import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { day } from './days.js';
import { storedLink } from './links.js';
import { as, signInAsAdmin } from './sessions.js';

// A manual performance entry racing Finalize on the same contract, in real PostgreSQL (PBI-27
// AC 18; OWASP A08:2025). Finalize locks the contract row, reads the links' numbers and freezes
// them. A manual entry must queue behind that lock and then see the frozen invoice, or the live
// numbers and the frozen ones disagree. The order is made, not left to timing: a held
// transaction takes the lock first, and pg_stat_activity shows who waits on it.
const MARKER = 'e2e-performance-race';

let videoSeq = 7600000000000000000n;
const tiktok = () => `https://www.tiktok.com/@tofly/video/${(videoSeq += 1n)}`;

describe('manual performance entry racing Finalize (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let adminUserId: string;
  let seq = 0;

  /** An ended contract with one delivered TikTok link that failed to sync at 9,000 views. */
  async function contractWithLink() {
    const user = await prisma.users.create({
      data: {
        email: `${MARKER}-${(seq += 1)}@example.com`,
        creators: {
          create: {
            first_name: MARKER,
            contracts: {
              create: {
                start_date: day(-90),
                end_date: day(-1),
                contract_type: 'regular',
                days_between: 14,
                content_quota: 1,
                fixed_rate: 100000,
              },
            },
          },
        },
      },
      include: { creators: { include: { contracts: true } } },
    });
    const contractId = user.creators!.contracts[0].id;
    const content = await prisma.contents.create({
      data: {
        contract_id: contractId,
        name: `${MARKER} ${seq}`,
        type: 'evergreen',
        deadline: day(-20),
        status: 'link_submitted',
        video_submitted_at: day(-21),
        content_links: {
          create: {
            ...storedLink(tiktok(), day(-21), user.id, 'tiktok'),
            data_state: 'sync_failed',
            views: 9000,
          },
        },
      },
    });
    return { contractId, contentId: content.id };
  }

  /**
   * Holds the contract row lock in a transaction of its own, as Finalize does from its first
   * statement: inside it `work` runs, and nothing commits until `release` is called.
   */
  async function holdLock(
    contractId: string,
    work: (
      tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    ) => Promise<void>,
  ) {
    let release!: () => void;
    let locked!: () => void;
    const ready = new Promise<void>((resolve) => (locked = resolve));
    const gate = new Promise<void>((resolve) => (release = resolve));
    const held = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM contracts WHERE id = ${contractId}::uuid FOR UPDATE`;
        await work(tx);
        locked();
        await gate;
      },
      { timeout: 15_000 },
    );
    await Promise.race([ready, held]);
    return { release, held };
  }

  /** Resolves once `count` statements wait on a contract row lock. */
  async function blockedOnLock(count: number): Promise<'blocked'> {
    await vi.waitFor(
      async () => {
        const [{ waiting }] = await prisma.$queryRaw<{ waiting: number }[]>`
          SELECT count(*)::int AS waiting FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'
            AND query LIKE '%FROM contracts%FOR UPDATE%'
        `;
        expect(waiting).toBe(count);
      },
      { timeout: 5_000, interval: 25 },
    );
    return 'blocked';
  }

  const enter = (contentId: string, views: number) =>
    as(app, admin)
      .put(`/contents/${contentId}/links/tiktok/performance`)
      .send({ views });

  const settled = (call: request.Test) =>
    call.then((response) => ({ response }) as const);

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    admin = await signInAsAdmin(app, prisma, MARKER);
    adminUserId = (
      await prisma.users.findUniqueOrThrow({
        where: { email: `${MARKER}-signed-in-admin@example.com` },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.creators.deleteMany({ where: { first_name: MARKER } });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARKER } } });
    await app.close();
  });

  it('A: Finalize locks first and freezes 9,000 views; the manual entry waits, then is refused, and the live numbers stay as frozen', async () => {
    const { contractId, contentId } = await contractWithLink();

    // Finalize's critical section, uncommitted: the contract locked, the link's numbers read
    // and frozen into the invoice.
    let frozenViews: number | null = null;
    const { release, held } = await holdLock(contractId, async (tx) => {
      const [link] = await tx.$queryRaw<{ views: number | null }[]>`
        SELECT views FROM content_links WHERE content_id = ${contentId}::uuid
      `;
      frozenViews = link.views;
      await tx.invoices.create({
        data: {
          contract_id: contractId,
          status: 'finalized',
          finalized_at: new Date(),
          finalized_by: adminUserId,
          snapshot: { views: link.views },
        },
      });
    });

    const manual = settled(enter(contentId, 12_400));
    // The entry must be seen waiting behind Finalize; one that does not wait finishes first.
    const first = await Promise.race([manual, blockedOnLock(1)]);
    release();
    await held;
    const { response } = await manual;

    expect(frozenViews).toBe(9000);
    expect(first).toBe('blocked');
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('INVOICE_FINALIZED');
    const link = await prisma.content_links.findFirstOrThrow({
      where: { content_id: contentId },
    });
    expect(link).toMatchObject({ views: 9000, data_state: 'sync_failed' });
    expect(
      await prisma.content_events.count({
        where: { content_id: contentId, event_type: 'Performance Entered' },
      }),
    ).toBe(0);
  });
});
