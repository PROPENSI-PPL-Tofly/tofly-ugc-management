import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { link_data_state, social_platform } from '@prisma/client';
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
  });
});
