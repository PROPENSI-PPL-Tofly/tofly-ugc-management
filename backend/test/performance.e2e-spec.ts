import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  PrismaClient,
  type link_data_state,
  type social_platform,
} from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { day } from './days.js';
import { storedLink } from './links.js';
import { as, signIn, signInAsAdmin } from './sessions.js';

// PBI-27 27.1 against the real schema and real sessions: an admin's manual numbers, refused
// and accepted, with what lands in content_links and content_events. Rows carry this marker so
// the cleanup never touches anything else.
const MARKER = 'e2e-performance';

let videoSeq = 7500000000000000000n;
const tiktok = () => `https://www.tiktok.com/@tofly/video/${(videoSeq += 1n)}`;

interface Creator {
  creatorId: string;
  userId: string;
  contractId: string;
}

describe('content performance (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let adminUserId: string;
  let owner: Creator;
  let creatorCookie: string;
  let seq = 0;

  async function creator(name: string): Promise<Creator> {
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

  /** The creator's account on a platform: connected the PBI-19 way, or only on file. */
  function account(
    who: Creator,
    platform: social_platform,
    connected: boolean,
  ) {
    return prisma.social_accounts.create({
      data: {
        creator_id: who.creatorId,
        platform,
        username: `${MARKER}-${(seq += 1)}`,
        is_connected: connected,
        platform_user_id: connected ? `${MARKER}-${seq}` : null,
      },
    });
  }

  /** A delivered content with one TikTok link in the given state and numbers. */
  async function linked(
    who: Creator,
    state: link_data_state,
    numbers: Partial<
      Record<'views' | 'likes' | 'comments' | 'shares', number>
    > = {},
  ) {
    const content = await prisma.contents.create({
      data: {
        contract_id: who.contractId,
        name: `${MARKER} ${(seq += 1)}`,
        type: 'evergreen',
        deadline: day(-2),
        status: 'link_submitted',
        video_submitted_at: day(-3),
        content_links: {
          create: {
            ...storedLink(tiktok(), day(-3), who.userId, 'tiktok'),
            data_state: state,
            ...numbers,
          },
        },
      },
    });
    return content.id;
  }

  const linkOf = (contentId: string) =>
    prisma.content_links.findFirstOrThrow({ where: { content_id: contentId } });
  const eventsOf = (contentId: string) =>
    prisma.content_events.findMany({
      where: { content_id: contentId, event_type: 'Performance Entered' },
    });
  const enter = (contentId: string, body: object, platform = 'tiktok') =>
    as(app, admin)
      .put(`/contents/${contentId}/links/${platform}/performance`)
      .send(body);

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
    owner = await creator('owner');
    creatorCookie = await signIn(app, {
      userId: owner.userId,
      role: 'creator',
      creatorId: owner.creatorId,
    });
  });

  afterAll(async () => {
    await prisma.creators.deleteMany({ where: { first_name: MARKER } });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARKER } } });
    await app.close();
  });

  describe('PUT /contents/:id/links/:platform/performance', () => {
    it('stores the numbers as manual with the admin and the time, and records them in the timeline (AC 16)', async () => {
      const contentId = await linked(owner, 'sync_failed', {
        views: 9000,
        comments: 4,
      });
      const before = Date.now();

      const response = await enter(contentId, {
        views: 12400,
        likes: 500,
        comments: 0,
        shares: '',
      });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        views: 12400,
        likes: 500,
        comments: 0,
        shares: null,
        state: 'manual',
        lastSyncedAt: null,
      });
      expect(response.body).not.toHaveProperty('manualBy');
      const link = await linkOf(contentId);
      expect(link).toMatchObject({
        views: 12400,
        likes: 500,
        comments: 0,
        shares: null,
        data_state: 'manual',
        manual_by: adminUserId,
      });
      expect(link.manual_at!.getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(response.body.manualAt).toBe(link.manual_at!.toISOString());

      const events = await eventsOf(contentId);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        actor_name: 'Admin',
        actor_role: 'admin',
        actor_user_id: adminUserId,
        event_data: {
          platform: 'tiktok',
          previous: { views: 9000, likes: null, comments: 4, shares: null },
          entered: { views: 12400, likes: 500, comments: 0, shares: null },
        },
      });
    });

    it('takes numbers for a waiting link whose creator never connected TikTok, before any sync (AC 14)', async () => {
      const contentId = await linked(owner, 'waiting');

      const response = await enter(contentId, { views: 1 });

      expect(response.status).toBe(200);
      expect((await linkOf(contentId)).data_state).toBe('manual');
    });

    it('refuses a waiting link of a connected account with 409 MANUAL_NOT_ALLOWED, changing nothing', async () => {
      const connected = await creator('connected');
      await account(connected, 'tiktok', true);
      const contentId = await linked(connected, 'waiting');

      const response = await enter(contentId, { views: 1 });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('MANUAL_NOT_ALLOWED');
      expect(await linkOf(contentId)).toMatchObject({
        views: null,
        data_state: 'waiting',
        manual_by: null,
      });
      expect(await eventsOf(contentId)).toHaveLength(0);
    });

    it('refuses a synced link with 409 MANUAL_NOT_ALLOWED', async () => {
      const contentId = await linked(owner, 'synced', { views: 50 });

      const response = await enter(contentId, { views: 1 });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('MANUAL_NOT_ALLOWED');
      expect((await linkOf(contentId)).views).toBe(50);
    });

    it('refuses once the invoice is finalized with 409 INVOICE_FINALIZED, writing nothing (AC 18)', async () => {
      const frozen = await creator('frozen');
      const contentId = await linked(frozen, 'not_found', { views: 70 });
      await prisma.invoices.create({
        data: {
          contract_id: frozen.contractId,
          status: 'finalized',
          finalized_at: new Date(),
          finalized_by: adminUserId,
          snapshot: {},
        },
      });

      const response = await enter(contentId, { views: 1 });

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        code: 'INVOICE_FINALIZED',
        message: 'Invoice sudah difinalisasi. Koreksi lewat penyesuaian.',
      });
      expect(await linkOf(contentId)).toMatchObject({
        views: 70,
        data_state: 'not_found',
      });
      expect(await eventsOf(contentId)).toHaveLength(0);
    });

    it('answers 422 with one error per bad field and stores nothing (AC 15)', async () => {
      const contentId = await linked(owner, 'sync_failed');

      const response = await enter(contentId, {
        views: 1_000_000_000,
        likes: 1.5,
      });

      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({
        message: 'Data performa tidak valid',
        errors: {
          views: 'Isi bilangan bulat 0 sampai 999.999.999',
          likes: 'Isi bilangan bulat 0 sampai 999.999.999',
        },
      });
      expect((await linkOf(contentId)).data_state).toBe('sync_failed');
    });

    it('answers 404 for a platform the content has no link on, and for a content that does not exist', async () => {
      const contentId = await linked(owner, 'sync_failed');

      const noLink = await enter(contentId, { views: 1 }, 'instagram');
      const noContent = await enter('00000000-0000-4000-8000-000000000000', {
        views: 1,
      });

      expect(noLink.status).toBe(404);
      expect(noLink.body.code).toBe('LINK_NOT_FOUND');
      expect(noContent.status).toBe(404);
      expect(noContent.body.code).toBe('CONTENT_NOT_FOUND');
    });

    it('answers 403 to a creator, even for their own content, 401 when signed out and 403 to another site (OWASP A01:2025)', async () => {
      const contentId = await linked(owner, 'sync_failed');
      const path = `/contents/${contentId}/links/tiktok/performance`;

      const asCreator = await as(app, creatorCookie)
        .put(path)
        .send({ views: 1 });
      // Signed out, from the app's own pages: no session cookie at all.
      const signedOut = await as(app, '').put(path).send({ views: 1 });
      // The admin's own session, sent from another site: refused before the session is read.
      const crossSite = await request(app.getHttpServer())
        .put(path)
        .set('Cookie', admin)
        .set('Origin', 'https://evil.example')
        .send({ views: 1 });

      expect(asCreator.status).toBe(403);
      expect(signedOut.status).toBe(401);
      expect(crossSite.status).toBe(403);
      expect((await linkOf(contentId)).data_state).toBe('sync_failed');
    });

    it('keeps the numbers untouched when the timeline write fails: both land or neither (OWASP A10:2025)', async () => {
      const contentId = await linked(owner, 'not_found', { views: 70 });
      // A trigger, made by the role that runs migrations, refuses this content's timeline event.
      // Only this content: every other test's events still land.
      const migrator = new PrismaClient({
        datasourceUrl: process.env.MIGRATOR_DB_URL ?? process.env.DATABASE_URL,
      });
      // Built from the test's own UUID, never from input.
      const fn = `e2e_refuse_${contentId.replaceAll('-', '_')}`;
      await migrator.$executeRawUnsafe(
        `CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
           IF NEW.content_id = '${contentId}'::uuid THEN RAISE EXCEPTION 'timeline refused'; END IF;
           RETURN NEW; END $$`,
      );
      await migrator.$executeRawUnsafe(
        `CREATE TRIGGER ${fn} BEFORE INSERT ON content_events FOR EACH ROW EXECUTE FUNCTION ${fn}()`,
      );

      try {
        const response = await enter(contentId, { views: 12_400 });

        expect(response.status).toBe(500);
        expect(JSON.stringify(response.body)).not.toMatch(
          /timeline refused|content_events|trigger/,
        );
        expect(await linkOf(contentId)).toMatchObject({
          views: 70,
          data_state: 'not_found',
          manual_by: null,
          manual_at: null,
        });
      } finally {
        await migrator.$executeRawUnsafe(
          `DROP TRIGGER ${fn} ON content_events`,
        );
        await migrator.$executeRawUnsafe(`DROP FUNCTION ${fn}()`);
        await migrator.$disconnect();
      }
    });
  });

  describe('PUT /contents/:id/links/:platform, replacing a link (PBI-38 AC 9)', () => {
    it("drops the old video's numbers, state, sync time and manual stamp in the same update, and still records Link Replaced", async () => {
      const contentId = await linked(owner, 'sync_failed', {
        views: 9000,
        likes: 12,
      });
      expect((await enter(contentId, { views: 12_400 })).status).toBe(200);
      await prisma.content_links.updateMany({
        where: { content_id: contentId },
        data: { last_synced_at: new Date('2026-11-01T19:00:00Z') },
      });
      const newVideo = tiktok();

      const response = await as(app, admin)
        .put(`/contents/${contentId}/links/tiktok`)
        .send({ url: newVideo });

      expect(response.status).toBe(200);
      expect(await linkOf(contentId)).toMatchObject({
        url: newVideo,
        views: null,
        likes: null,
        comments: null,
        shares: null,
        data_state: 'waiting',
        last_synced_at: null,
        manual_by: null,
        manual_at: null,
      });
      expect(
        await prisma.content_events.count({
          where: { content_id: contentId, event_type: 'Link Replaced' },
        }),
      ).toBe(1);
    });
  });

  describe('reading performance: the lists and Content Detail (AC 19-26)', () => {
    let lister: Creator;
    let listerCookie: string;
    let other: Creator;
    let instagramPost = 0;
    const reel = () =>
      `https://www.instagram.com/reel/${MARKER}-list-${(instagramPost += 1)}/`;

    /** A delivered content with one link handed in `daysAgo` days ago. */
    async function handedIn(
      who: Creator,
      platform: social_platform,
      daysAgo: number,
      numbers: Partial<Record<'views' | 'likes', number>> = {},
    ) {
      const url = platform === 'tiktok' ? tiktok() : reel();
      const content = await prisma.contents.create({
        data: {
          contract_id: who.contractId,
          name: `${MARKER} list ${(seq += 1)}`,
          type: 'evergreen',
          deadline: day(-daysAgo + 1),
          status: 'link_submitted',
          video_submitted_at: day(-daysAgo),
          content_links: {
            create: {
              ...storedLink(url, day(-daysAgo), who.userId, platform),
              ...numbers,
            },
          },
        },
      });
      return { contentId: content.id, url };
    }

    const list = (query: string, cookie = admin) =>
      as(app, cookie).get(`/performance/links${query}`);

    let newest: { contentId: string; url: string };
    let middle: { contentId: string; url: string };
    let oldest: { contentId: string; url: string };

    beforeAll(async () => {
      lister = await creator('lister');
      other = await creator('other-lister');
      await account(lister, 'instagram', true);
      listerCookie = await signIn(app, {
        userId: lister.userId,
        role: 'creator',
        creatorId: lister.creatorId,
      });
      oldest = await handedIn(lister, 'instagram', 9, { views: 0, likes: 3 });
      middle = await handedIn(lister, 'tiktok', 6);
      newest = await handedIn(lister, 'instagram', 2, { views: 800 });
      await handedIn(other, 'tiktok', 1, { views: 5 });
    });

    it("lists one creator's links newest first with their content, creator and effective state", async () => {
      const response = await list(`?creator=${lister.creatorId}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        page: 1,
        pageSize: 10,
        total: 3,
        totalPages: 1,
      });
      expect(
        response.body.items.map((item: { url: string }) => item.url),
      ).toEqual([newest.url, middle.url, oldest.url]);
      expect(response.body.items[0]).toEqual({
        linkId: expect.any(String),
        contentId: newest.contentId,
        contentName: expect.stringContaining(MARKER),
        creatorId: lister.creatorId,
        creatorName: `${MARKER} lister`,
        platform: 'instagram',
        url: newest.url,
        views: 800,
        likes: null,
        comments: null,
        shares: null,
        // Instagram is connected for this creator, so a waiting link stays waiting.
        state: 'waiting',
        lastSyncedAt: null,
        manualAt: null,
      });
      // TikTok is not connected: the waiting link reads not_connected. A stored 0 stays 0.
      expect(response.body.items[1].state).toBe('not_connected');
      expect(response.body.items[2]).toMatchObject({ views: 0, likes: 3 });
    });

    it('narrows by repeated creators and platforms', async () => {
      const both = await list(
        `?creator=${lister.creatorId}&creator=${other.creatorId}&platform=tiktok`,
      );

      expect(both.status).toBe(200);
      expect(both.body.total).toBe(2);
      expect(
        both.body.items.every(
          (item: { platform: string }) => item.platform === 'tiktok',
        ),
      ).toBe(true);
    });

    it('pages in the database: the last page holds the rest, a page past the end is empty', async () => {
      const first = await list(`?creator=${lister.creatorId}&pageSize=2`);
      const second = await list(
        `?creator=${lister.creatorId}&pageSize=2&page=2`,
      );
      const past = await list(`?creator=${lister.creatorId}&pageSize=2&page=3`);

      expect(first.body).toMatchObject({ total: 3, totalPages: 2 });
      expect(first.body.items).toHaveLength(2);
      expect(
        second.body.items.map((item: { url: string }) => item.url),
      ).toEqual([oldest.url]);
      expect(past.body).toMatchObject({ items: [], total: 3, totalPages: 2 });
    });

    it('answers an empty page for a creator with no links, and 400 for a bad filter', async () => {
      const nobody = await creator('no-links');

      expect((await list(`?creator=${nobody.creatorId}`)).body).toEqual({
        items: [],
        page: 1,
        pageSize: 10,
        total: 0,
        totalPages: 0,
      });
      expect((await list('?platform=youtube')).status).toBe(400);
    });

    it('keeps the admin list from creators (403) and the signed out (401)', async () => {
      expect((await list('', listerCookie)).status).toBe(403);
      expect((await list('', '')).status).toBe(401);
    });

    it('gives a creator their own links only, whatever creator the address names (AC 20, OWASP A01:2025)', async () => {
      const response = await as(app, listerCookie).get(
        `/me/performance/links?creator=${other.creatorId}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(3);
      expect(
        response.body.items.every(
          (item: { creatorId: string }) => item.creatorId === lister.creatorId,
        ),
      ).toBe(true);
      expect((await as(app, admin).get('/me/performance/links')).status).toBe(
        403,
      );
      expect((await as(app, '').get('/me/performance/links')).status).toBe(401);
    });

    it("gives every Content Detail link its performance, for the admin and the creator, and hides another creator's content", async () => {
      const asAdmin = await as(app, admin).get(`/contents/${oldest.contentId}`);
      const asCreator = await as(app, listerCookie).get(
        `/me/contents/${oldest.contentId}`,
      );
      const notTheirs = await as(app, listerCookie).get(
        `/me/contents/${(await handedIn(other, 'tiktok', 3)).contentId}`,
      );

      const performance = {
        views: 0,
        likes: 3,
        comments: null,
        shares: null,
        state: 'waiting',
        lastSyncedAt: null,
        manualAt: null,
      };
      expect(asAdmin.status).toBe(200);
      expect(asAdmin.body.links[0].performance).toEqual(performance);
      expect(asCreator.status).toBe(200);
      expect(asCreator.body.links[0].performance).toEqual(performance);
      expect(JSON.stringify(asCreator.body)).not.toMatch(/manual_?by/i);
      expect(notTheirs.status).toBe(404);
    });
  });
});
