import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import {
  CONTRACT_SYNC,
  type ContractSync,
  type PerformanceSource,
  type SourceResult,
} from '../src/performance/ports.js';
import { PERFORMANCE_SOURCES } from '../src/performance/sync/performance-sync.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { day } from './days.js';
import { storedLink } from './links.js';
import { as, signIn, signInAsAdmin } from './sessions.js';

// PBI-27 27.4 against the real schema: which links a sync picks, what it writes, the lease behind
// the 409, and both routes' guards. The platforms are stand-ins; everything else is the app's.

const MARKER = 'e2e-performance-sync';
const SECRET = `${MARKER}-secret-long-enough-for-the-guard-0123456789`;
const METRICS = { views: 12400, likes: 830, comments: 41, shares: null };
let videoSeq = 7600000000000000000n;
const tiktok = () => `https://www.tiktok.com/@tofly/video/${(videoSeq += 1n)}`;

type Answer = (
  creatorId: string,
  links: readonly { id: string }[],
) => Promise<SourceResult>;

const synced: Answer = async (_, links) => ({
  outcome: 'read',
  readings: links.map((link) => ({
    linkId: link.id,
    outcome: 'synced',
    metrics: METRICS,
  })),
});

describe('performance sync (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let creator: string;
  let answer: Answer = synced;
  const tiktokSource: PerformanceSource = {
    platform: 'tiktok',
    read: (creatorId, links) => answer(creatorId, links),
  };
  let ada: { creatorId: string; userId: string; contractId: string };
  let budi: { creatorId: string; userId: string; contractId: string };

  async function newCreator(name: string) {
    const user = await prisma.users.create({
      data: {
        email: `${MARKER}-${name}@example.com`,
        creators: {
          create: {
            first_name: MARKER,
            last_name: name,
            contracts: {
              create: {
                start_date: day(-30),
                end_date: day(90),
                contract_type: 'regular',
                days_between: 14,
                content_quota: 4,
                fixed_rate: 100000,
              },
            },
          },
        },
      },
      include: { creators: { include: { contracts: true } } },
    });
    return {
      creatorId: user.creators!.id,
      userId: user.id,
      contractId: user.creators!.contracts[0].id,
    };
  }

  function content(
    who: { contractId: string; userId: string },
    status: 'link_submitted' | 'draft_review' = 'link_submitted',
  ) {
    return prisma.contents.create({
      data: {
        contract_id: who.contractId,
        name: `${MARKER} content`,
        type: 'evergreen',
        deadline: day(-1),
        status,
        video_submitted_at: day(-3),
        content_links: {
          create: [storedLink(tiktok(), day(-3), who.userId, 'tiktok')],
        },
      },
      include: { content_links: true },
    });
  }

  const linkOf = (contentId: string) =>
    prisma.content_links.findFirstOrThrow({ where: { content_id: contentId } });

  beforeAll(async () => {
    vi.stubEnv('DEV_AUTH_ENABLED', '');
    vi.stubEnv('PERFORMANCE_SYNC_SECRET', SECRET);
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

    admin = await signInAsAdmin(app, prisma, MARKER);
    ada = await newCreator('ada');
    budi = await newCreator('budi');
    creator = await signIn(app, {
      userId: ada.userId,
      role: 'creator',
      creatorId: ada.creatorId,
    });
  });

  beforeEach(() => {
    answer = synced;
  });

  afterAll(async () => {
    await prisma.creators.deleteMany({ where: { first_name: MARKER } });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARKER } } });
    await app.close();
    vi.unstubAllEnvs();
  });

  describe('POST /contents/:id/performance-sync ("Sinkronkan", AC 12-13)', () => {
    it("saves the link's numbers as Tersinkron with the sync time and frees the content", async () => {
      const made = await content(ada);

      const response = await as(app, admin).post(
        `/contents/${made.id}/performance-sync`,
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ notUpdated: [] });
      const link = await linkOf(made.id);
      expect(link).toMatchObject({ ...METRICS, data_state: 'synced' });
      expect(link.last_synced_at).toBeInstanceOf(Date);
      const after = await prisma.contents.findUniqueOrThrow({
        where: { id: made.id },
      });
      expect(after.performance_sync_lease_until).toBeNull();
    });

    it('answers 409 to a second press while the first is still reading, and syncs once (AC 13)', async () => {
      const made = await content(ada);
      let calls = 0;
      let finish!: () => void;
      const gate = new Promise<void>((resolve) => (finish = resolve));
      answer = async (creatorId, links) => {
        calls += 1;
        await gate;
        return synced(creatorId, links);
      };

      const first = as(app, admin)
        .post(`/contents/${made.id}/performance-sync`)
        .then((r) => r);
      // Wait until the first press holds the content before pressing again.
      await vi.waitFor(() => expect(calls).toBe(1));
      const second = await as(app, admin).post(
        `/contents/${made.id}/performance-sync`,
      );
      finish();

      expect(second.status).toBe(409);
      expect(second.body).toEqual({
        code: 'SYNC_RUNNING',
        message: 'Konten ini sedang disinkronkan',
      });
      expect((await first).status).toBe(200);
      expect(calls).toBe(1);
    });

    it('names the platform it could not update and keeps the last numbers (AC 6, 13)', async () => {
      const made = await content(ada);
      await prisma.content_links.updateMany({
        where: { content_id: made.id },
        data: { views: 500, data_state: 'synced' },
      });
      answer = async (_, links) => ({
        outcome: 'read',
        readings: links.map((link) => ({
          linkId: link.id,
          outcome: 'failed',
          reason: 'video/query: TikTok answered 503',
        })),
      });

      const response = await as(app, admin).post(
        `/contents/${made.id}/performance-sync`,
      );

      expect(response.body).toEqual({ notUpdated: [{ platform: 'tiktok' }] });
      expect(await linkOf(made.id)).toMatchObject({
        views: 500,
        data_state: 'sync_failed',
      });
    });

    it('refuses content whose invoice is finalized, leaving its numbers frozen (AC 5)', async () => {
      const frozen = await newCreator('frozen');
      const made = await content(frozen);
      await prisma.invoices.create({
        data: {
          contract_id: frozen.contractId,
          status: 'finalized',
          finalized_at: new Date(),
          snapshot: {},
        },
      });

      const response = await as(app, admin).post(
        `/contents/${made.id}/performance-sync`,
      );

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('SYNC_NOT_ALLOWED');
      expect((await linkOf(made.id)).data_state).toBe('waiting');
    });

    it('answers 404 for content that does not exist', async () => {
      const response = await as(app, admin).post(
        '/contents/00000000-0000-4000-8000-000000000000/performance-sync',
      );

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('CONTENT_NOT_FOUND');
    });

    it('refuses a creator with 403: only an admin syncs (OWASP A01)', async () => {
      const made = await content(ada);

      expect(
        (await as(app, creator).post(`/contents/${made.id}/performance-sync`))
          .status,
      ).toBe(403);
    });
  });

  describe('the last sync before Finalize (CONTRACT_SYNC)', () => {
    it("syncs only that contract's delivered links, isolating a failing one (AC 4, 6)", async () => {
      const contract = await newCreator('contract');
      const delivered = await content(contract);
      const drafting = await content(contract, 'draft_review');
      const other = await content(budi);
      const sync = app.get<ContractSync>(CONTRACT_SYNC);

      expect(await sync.syncContract(contract.contractId)).toEqual({
        notUpdated: [],
      });
      expect((await linkOf(delivered.id)).data_state).toBe('synced');
      expect((await linkOf(drafting.id)).data_state).toBe('waiting');
      expect((await linkOf(other.id)).data_state).toBe('waiting');
    });
  });

  describe('POST /internal/performance-sync (the 02:00 WIB job)', () => {
    it.each([
      ['no secret header', {}],
      ['a wrong secret', { 'x-sync-secret': `${SECRET}x` }],
    ])(
      'refuses %s with 401 and syncs nothing (OWASP A07)',
      async (_, headers) => {
        const made = await content(budi);

        const response = await request(app.getHttpServer())
          .post('/internal/performance-sync')
          .set(headers);

        expect(response.status).toBe(401);
        expect(response.body).toEqual({
          code: 'SYNC_SECRET_INVALID',
          message: 'Unauthorized',
        });
        expect((await linkOf(made.id)).data_state).toBe('waiting');
      },
    );

    it('ignores an admin session: the secret is the only way in', async () => {
      const response = await as(app, admin).post('/internal/performance-sync');

      expect(response.status).toBe(401);
    });

    it("runs with the scheduler's secret, saving each link and skipping content another sync holds", async () => {
      const mine = await content(budi);
      const held = await content(budi);
      // Every content outside this suite is held for the run, so it reads and writes only ours.
      const outside = await prisma.contents.findMany({
        where: {
          performance_sync_lease_until: null,
          contracts: { creators: { first_name: { not: MARKER } } },
        },
        select: { id: true },
      });
      const until = new Date(Date.now() + 10 * 60_000);
      const heldIds = [held.id, ...outside.map(({ id }) => id)];
      await prisma.contents.updateMany({
        where: { id: { in: heldIds } },
        data: { performance_sync_lease_until: until },
      });
      try {
        const response = await request(app.getHttpServer())
          .post('/internal/performance-sync')
          .set('x-sync-secret', SECRET);

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          failed: 0,
          durationMs: expect.any(Number),
        });
        expect(response.body.succeeded).toBe(response.body.processed);
        expect(response.body.skipped).toBeGreaterThanOrEqual(1);
        expect((await linkOf(mine.id)).data_state).toBe('synced');
        expect((await linkOf(held.id)).data_state).toBe('waiting');
      } finally {
        await prisma.contents.updateMany({
          where: { id: { in: heldIds }, performance_sync_lease_until: until },
          data: { performance_sync_lease_until: null },
        });
      }
    });
  });
});
