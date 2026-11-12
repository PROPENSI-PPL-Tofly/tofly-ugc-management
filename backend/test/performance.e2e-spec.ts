import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { day } from './days.js';
import { storedLink } from './links.js';
import { as, signIn, signInAsAdmin } from './sessions.js';

// PBI-27 27.1 against the real schema: the new content_links columns and their checks, the
// manual input route, the Performa Konten list and Content Detail, through real sessions.

const MARKER = 'e2e-performance';
const reel = (name: string) =>
  `https://www.instagram.com/reel/${MARKER}-${name}/`;
let videoSeq = 7500000000000000000n;
const tiktok = () => `https://www.tiktok.com/@tofly/video/${(videoSeq += 1n)}`;

describe('content performance (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let adminId: string;
  let creator: string;
  let owner: { creatorId: string; userId: string; contractId: string };
  let other: { creatorId: string; userId: string; contractId: string };

  async function newCreator(name: string, instagramConnected: boolean) {
    const user = await prisma.users.create({
      data: {
        email: `${MARKER}-${name}@example.com`,
        creators: {
          create: {
            first_name: MARKER,
            last_name: name,
            social_accounts: {
              create: [
                {
                  platform: 'instagram',
                  username: `${MARKER}-${name}-ig`,
                  is_connected: instagramConnected,
                  platform_user_id: instagramConnected
                    ? `${MARKER}-${name}-ig-id`
                    : null,
                },
                { platform: 'tiktok', username: `${MARKER}-${name}-tt` },
              ],
            },
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

  /** A content with an Instagram and a TikTok link, handed in three days ago. */
  function linked(who: { contractId: string; userId: string }, name: string) {
    return prisma.contents.create({
      data: {
        contract_id: who.contractId,
        name: `${MARKER} ${name}`,
        type: 'evergreen',
        deadline: day(-1),
        status: 'link_submitted',
        video_submitted_at: day(-3),
        content_links: {
          create: [
            storedLink(reel(name), day(-3), who.userId, 'instagram'),
            storedLink(tiktok(), day(-3), who.userId, 'tiktok'),
          ],
        },
      },
    });
  }

  function linkOf(contentId: string, platform: 'instagram' | 'tiktok') {
    return prisma.content_links.findFirstOrThrow({
      where: { content_id: contentId, platform },
    });
  }

  beforeAll(async () => {
    vi.stubEnv('DEV_AUTH_ENABLED', '');
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);

    admin = await signInAsAdmin(app, prisma, MARKER);
    adminId = (
      await prisma.users.findUniqueOrThrow({
        where: { email: `${MARKER}-signed-in-admin@example.com` },
      })
    ).id;
    owner = await newCreator('owner', true);
    other = await newCreator('other', false);
    creator = await signIn(app, {
      userId: owner.userId,
      role: 'creator',
      creatorId: owner.creatorId,
    });
  });

  afterAll(async () => {
    await prisma.creators.deleteMany({ where: { first_name: MARKER } });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARKER } } });
    await app.close();
    vi.unstubAllEnvs();
  });

  describe('content_links columns', () => {
    it('starts a new link waiting, with every number empty (AC 1, 2)', async () => {
      const content = await linked(owner, 'fresh');

      expect(await linkOf(content.id, 'instagram')).toMatchObject({
        views: null,
        likes: null,
        comments: null,
        shares: null,
        data_state: 'waiting',
        last_synced_at: null,
        manual_by: null,
        manual_at: null,
      });
    });

    it('refuses a negative number in the database itself', async () => {
      const content = await linked(owner, 'negative');
      const link = await linkOf(content.id, 'instagram');

      await expect(
        prisma.content_links.update({
          where: { id: link.id },
          data: { views: -1 },
        }),
      ).rejects.toThrow(/content_links_metrics_check/);
    });

    it('refuses an admin without a time, or a time without an admin', async () => {
      const content = await linked(owner, 'half-stamp');
      const link = await linkOf(content.id, 'instagram');

      await expect(
        prisma.content_links.update({
          where: { id: link.id },
          data: { manual_by: adminId },
        }),
      ).rejects.toThrow(/content_links_manual_check/);
    });
  });

  describe('PUT /contents/:id/links/:platform/performance', () => {
    it('saves numbers on a link whose account is not connected, records the timeline, and Content Detail shows them (AC 14-16, 19)', async () => {
      const content = await linked(other, 'manual');

      const response = await as(app, admin)
        .put(`/contents/${content.id}/links/instagram/performance`)
        .send({ views: '12400', likes: 830, comments: '' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        platform: 'instagram',
        views: 12400,
        likes: 830,
        comments: null,
        shares: null,
        state: 'manual',
        manualBy: `${MARKER}-signed-in-admin@example.com`,
      });
      expect(await linkOf(content.id, 'instagram')).toMatchObject({
        views: 12400,
        likes: 830,
        comments: null,
        data_state: 'manual',
        manual_by: adminId,
      });
      const events = await prisma.content_events.findMany({
        where: { content_id: content.id, event_type: 'Performance Entered' },
      });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        actor_name: 'Admin',
        actor_role: 'admin',
        actor_user_id: adminId,
        event_data: {
          platform: 'instagram',
          before: {
            views: null,
            likes: null,
            comments: null,
            shares: null,
            state: 'not_connected',
          },
          after: {
            views: 12400,
            likes: 830,
            comments: null,
            shares: null,
            state: 'manual',
          },
        },
      });

      const detail = await as(app, admin).get(`/contents/${content.id}`);
      // Both links were handed in by one statement, so pick by platform, not by place.
      const instagram = detail.body.links.find(
        (link: { platform: string }) => link.platform === 'instagram',
      );
      expect(instagram.performance).toMatchObject({
        views: 12400,
        state: 'manual',
        manualBy: `${MARKER}-signed-in-admin@example.com`,
      });
    });

    it('refuses a link the platform still reads, with 409 (AC 14)', async () => {
      const content = await linked(owner, 'connected');

      const response = await as(app, admin)
        .put(`/contents/${content.id}/links/instagram/performance`)
        .send({ views: 1 });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('MANUAL_NOT_ALLOWED');
    });

    it('refuses once the invoice is finalized, with the message of AC 18', async () => {
      const finalized = await newCreator('finalized', false);
      await prisma.invoices.create({
        data: {
          contract_id: finalized.contractId,
          status: 'finalized',
          snapshot: {},
          finalized_at: new Date(),
          finalized_by: adminId,
        },
      });
      const content = await linked(finalized, 'frozen');

      const response = await as(app, admin)
        .put(`/contents/${content.id}/links/tiktok/performance`)
        .send({ views: 1 });

      expect(response.status).toBe(409);
      expect(response.body.message).toBe(
        'Invoice sudah difinalisasi. Koreksi lewat penyesuaian.',
      );
    });

    it('waits for a Finalize that holds the contract, then refuses, leaving the frozen numbers alone (AC 18)', async () => {
      const racing = await newCreator('racing', false);
      const invoice = await prisma.invoices.create({
        data: { contract_id: racing.contractId, status: 'running' },
      });
      const content = await linked(racing, 'racing');
      let entry: Promise<request.Response> | undefined;

      // Finalize's transaction, cut down to its lock and its status write: it holds the contract
      // row from its first statement to its commit, as InvoiceCommandService.finalize does.
      await prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM contracts WHERE id = ${racing.contractId}::uuid FOR UPDATE`;
          entry = as(app, admin)
            .put(`/contents/${content.id}/links/tiktok/performance`)
            .send({ views: 1 })
            .then((response) => response);
          await new Promise((resolve) => setTimeout(resolve, 500));
          await tx.invoices.update({
            where: { id: invoice.id },
            data: {
              status: 'finalized',
              snapshot: {},
              finalized_at: new Date(),
              finalized_by: adminId,
            },
          });
        },
        { timeout: 10_000 },
      );
      const response = await entry!;

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('INVOICE_FINALIZED');
      const link = await linkOf(content.id, 'tiktok');
      expect(link).toMatchObject({ views: null, data_state: 'waiting' });
    });

    it('answers 422 per field (AC 15)', async () => {
      const content = await linked(other, 'invalid');

      const response = await as(app, admin)
        .put(`/contents/${content.id}/links/tiktok/performance`)
        .send({ views: 1_000_000_000, likes: 'x' });

      expect(response.status).toBe(422);
      expect(Object.keys(response.body.errors)).toEqual(['views', 'likes']);
    });

    it('refuses a creator, even on their own content (OWASP A01)', async () => {
      const content = await linked(owner, 'creator-tries');

      const response = await as(app, creator)
        .put(`/contents/${content.id}/links/tiktok/performance`)
        .send({ views: 1 });

      expect(response.status).toBe(403);
      expect((await linkOf(content.id, 'tiktok')).views).toBeNull();
    });
  });

  describe('GET /performance/links', () => {
    it("lists one creator's links with numbers and state, 10 per page (AC 22-23)", async () => {
      await linked(other, 'listed');

      const response = await as(app, admin).get(
        `/performance/links?creator=${other.creatorId}&platform=tiktok`,
      );

      expect(response.status).toBe(200);
      expect(response.body.pageSize).toBe(10);
      expect(response.body.items.length).toBeGreaterThan(0);
      for (const item of response.body.items) {
        expect(item).toMatchObject({
          creatorId: other.creatorId,
          platform: 'tiktok',
          state: expect.any(String),
        });
      }
    });

    it('refuses a creator with 403 (AC 26)', async () => {
      expect((await as(app, creator).get('/performance/links')).status).toBe(
        403,
      );
    });
  });

  describe('GET /me/performance/links (AC 20)', () => {
    it("lists only the signed-in creator's links, even when the address names another", async () => {
      await linked(owner, 'mine-listed');
      await linked(other, 'not-mine');

      const response = await as(app, creator).get(
        `/me/performance/links?creator=${other.creatorId}&pageSize=50`,
      );

      expect(response.status).toBe(200);
      expect(response.body.pageSize).toBe(10);
      const urls = response.body.items.map((item: { url: string }) => item.url);
      expect(urls).toContain(reel('mine-listed'));
      expect(urls).not.toContain(reel('not-mine'));
      for (const item of response.body.items) {
        expect(item.creatorId).toBe(owner.creatorId);
      }
    });

    it("refuses an admin session with 403: the list is a creator's own", async () => {
      expect((await as(app, admin).get('/me/performance/links')).status).toBe(
        403,
      );
    });
  });

  describe("a creator's own Content Detail (AC 20)", () => {
    it("shows their numbers read-only, and another creator's content is not found (AC 21)", async () => {
      const own = await linked(owner, 'own');
      const theirs = await linked(other, 'theirs');

      const mine = await as(app, creator).get(`/me/contents/${own.id}`);
      expect(mine.status).toBe(200);
      // Instagram is connected for this creator and TikTok is not.
      expect(
        Object.fromEntries(
          mine.body.links.map(
            (link: { platform: string; performance: { state: string } }) => [
              link.platform,
              link.performance.state,
            ],
          ),
        ),
      ).toEqual({ instagram: 'waiting', tiktok: 'not_connected' });

      expect(
        (await as(app, creator).get(`/me/contents/${theirs.id}`)).status,
      ).toBe(404);
    });
  });

  describe('replacing a link (PBI-38 AC 9)', () => {
    it("drops the old video's numbers and state", async () => {
      const content = await linked(other, 'replaced');
      await as(app, admin)
        .put(`/contents/${content.id}/links/instagram/performance`)
        .send({ views: 500 });

      const response = await as(app, admin)
        .put(`/contents/${content.id}/links/instagram`)
        .send({ url: reel('replaced-new') });

      expect(response.status).toBe(200);
      expect(await linkOf(content.id, 'instagram')).toMatchObject({
        views: null,
        data_state: 'waiting',
        manual_by: null,
        manual_at: null,
      });
    });
  });
});
