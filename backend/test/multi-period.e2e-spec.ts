import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { DEV_CREATOR_HEADER } from '../src/auth/dev-creator.guard.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { day } from './days.js';

// PBI-30.2 (AC 8.2): content of a contract period that has not started stays out of Task Saya and
// takes no draft or link until the period starts, against the real database and the real routes.
//
// TEST FIXTURE, NOT PRODUCTION: there is no endpoint yet that gives a creator a second period
// (that is PBI-30.1's). The second period is inserted straight into `contracts` here, as 30.1's
// endpoint will leave it, so this subtask can be tested on its own.

// Rows created here carry this marker so the cleanup never touches anything else.
const MARKER = 'e2e-multi-period';
const DRAFT = 'https://drive.google.com/file/d/e2e-multi-period-draft';
const reel = (name: string) =>
  `https://www.instagram.com/reel/e2e-multi-period-${name}/`;

const PERIOD_NOT_STARTED = {
  code: 'PERIOD_NOT_STARTED',
  message: 'Periode kontrak konten ini belum dimulai',
};

type Status = 'scheduled' | 'draft_approved';

describe('Contract periods that have not started (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  /** Period 1 ends today; period 2 starts tomorrow. */
  let renewed: { creatorId: string; current: string; next: string };
  /** One period, starting today. */
  let startsToday: { creatorId: string; period: string };

  /** A creator with one contract row per [start, end] offset pair, oldest first. */
  async function creator(name: string, periods: [number, number][]) {
    const user = await prisma.users.create({
      data: {
        email: `${MARKER}-${name}@example.com`,
        creators: {
          create: {
            first_name: MARKER,
            last_name: name,
            // A link is taken only for a platform the creator has an account on (PBI-38 AC 3).
            social_accounts: {
              create: { platform: 'instagram', username: `${MARKER}-${name}` },
            },
            contracts: {
              create: periods.map(([start, end]) => ({
                start_date: day(start),
                end_date: day(end),
                contract_type: 'regular' as const,
                days_between: 14,
                content_quota: 4,
                fixed_rate: 100000,
              })),
            },
          },
        },
      },
      include: {
        creators: {
          include: { contracts: { orderBy: { start_date: 'asc' } } },
        },
      },
    });
    return {
      creatorId: user.creators!.id,
      contractIds: user.creators!.contracts.map((contract) => contract.id),
    };
  }

  function content(
    contractId: string,
    name: string,
    status: Status,
    deadline: number,
  ) {
    return prisma.contents.create({
      data: {
        contract_id: contractId,
        name: `${MARKER} ${name}`,
        type: 'specific',
        deadline: day(deadline),
        status,
      },
    });
  }

  function taskSaya(creatorId: string) {
    return request(app.getHttpServer())
      .get('/me/contents?tab=all&pageSize=50')
      .set(DEV_CREATOR_HEADER, creatorId);
  }

  function post(path: string, creatorId: string, body: object) {
    return request(app.getHttpServer())
      .post(path)
      .set(DEV_CREATOR_HEADER, creatorId)
      .send(body);
  }

  /** A content's status and how many drafts and links it holds, as a hand-in left them. */
  async function stateOf(contentId: string) {
    return prisma.contents.findUniqueOrThrow({
      where: { id: contentId },
      select: {
        status: true,
        _count: { select: { submissions: true, content_links: true } },
      },
    });
  }

  beforeAll(async () => {
    vi.stubEnv('DEV_AUTH_ENABLED', 'true');
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const a = await creator('renewed', [
      [-30, 0],
      [1, 120],
    ]);
    renewed = {
      creatorId: a.creatorId,
      current: a.contractIds[0],
      next: a.contractIds[1],
    };
    const b = await creator('starts-today', [[0, 90]]);
    startsToday = { creatorId: b.creatorId, period: b.contractIds[0] };
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    // Deleting the creator cascades to its contracts and contents; the user row goes separately.
    await prisma.creators.deleteMany({ where: { first_name: MARKER } });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARKER } } });
    await app.close();
  });

  describe('Task Saya (AC 8.2.1)', () => {
    it("lists the current period's content and none of the period starting tomorrow", async () => {
      const shown = await content(renewed.current, 'now', 'scheduled', -1);
      const hidden = await content(renewed.next, 'tomorrow', 'scheduled', 20);

      const response = await taskSaya(renewed.creatorId).expect(200);

      const ids = response.body.items.map((item: { id: string }) => item.id);
      expect(ids).toContain(shown.id);
      expect(ids).not.toContain(hidden.id);
      expect(response.body.tabCounts.all).toBe(ids.length);
    });

    it('lists the content of a period that starts today, as the database compares the start day', async () => {
      const today = await content(startsToday.period, 'today', 'scheduled', 20);

      const response = await taskSaya(startsToday.creatorId).expect(200);

      expect(
        response.body.items.map((item: { id: string }) => item.id),
      ).toContain(today.id);
    });
  });

  describe('hand-ins (AC 8.2.2)', () => {
    it('refuses a draft for content of the period starting tomorrow, saving nothing', async () => {
      const next = await content(renewed.next, 'draft', 'scheduled', 20);

      const response = await post(
        `/contents/${next.id}/draft`,
        renewed.creatorId,
        { link: DRAFT },
      );

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject(PERIOD_NOT_STARTED);
      expect(await stateOf(next.id)).toEqual({
        status: 'scheduled',
        _count: { submissions: 0, content_links: 0 },
      });
    });

    it('refuses a link on both routes for content of the period starting tomorrow, saving nothing', async () => {
      const next = await content(renewed.next, 'link', 'draft_approved', 20);

      const video = await post(
        `/contents/${next.id}/video`,
        renewed.creatorId,
        {
          link: reel('video'),
        },
      );
      const links = await post(
        `/contents/${next.id}/links`,
        renewed.creatorId,
        {
          links: { instagram: reel('links') },
        },
      );

      expect([video.status, links.status]).toEqual([409, 409]);
      expect(video.body).toMatchObject(PERIOD_NOT_STARTED);
      expect(links.body).toMatchObject(PERIOD_NOT_STARTED);
      expect(await stateOf(next.id)).toEqual({
        status: 'draft_approved',
        _count: { submissions: 0, content_links: 0 },
      });
    });

    it('still takes a draft and a link for content of the period that has started', async () => {
      const draft = await content(renewed.current, 'ok draft', 'scheduled', 0);
      const link = await content(
        renewed.current,
        'ok link',
        'draft_approved',
        0,
      );

      const drafted = await post(
        `/contents/${draft.id}/draft`,
        renewed.creatorId,
        { link: DRAFT },
      );
      const linked = await post(
        `/contents/${link.id}/links`,
        renewed.creatorId,
        { links: { instagram: reel('ok') } },
      );

      expect([drafted.status, linked.status]).toEqual([201, 201]);
      expect(await stateOf(draft.id)).toEqual({
        status: 'draft_review',
        _count: { submissions: 1, content_links: 0 },
      });
      expect(await stateOf(link.id)).toEqual({
        status: 'link_submitted',
        _count: { submissions: 0, content_links: 1 },
      });
    });

    it('refuses a comment on content of the period starting tomorrow, saving no event', async () => {
      const next = await content(renewed.next, 'comment', 'scheduled', 20);

      const response = await post(
        `/contents/${next.id}/comments`,
        renewed.creatorId,
        {
          comment: 'Boleh mulai lebih awal?',
        },
      );

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject(PERIOD_NOT_STARTED);
      await expect(
        prisma.content_events.count({
          where: { content_id: next.id, event_type: 'Creator Comment' },
        }),
      ).resolves.toBe(0);
    });

    it('answers the detail of content of the period starting tomorrow with 404, as Task Saya hides it', async () => {
      const next = await content(renewed.next, 'detail', 'scheduled', 20);
      const current = await content(
        renewed.current,
        'detail now',
        'scheduled',
        0,
      );

      const hidden = await request(app.getHttpServer())
        .get(`/me/contents/${next.id}`)
        .set(DEV_CREATOR_HEADER, renewed.creatorId);
      const shown = await request(app.getHttpServer())
        .get(`/me/contents/${current.id}`)
        .set(DEV_CREATOR_HEADER, renewed.creatorId);

      expect([hidden.status, shown.status]).toEqual([404, 200]);
      expect(hidden.body).toMatchObject({ code: 'CONTENT_NOT_FOUND' });
    });

    it("answers another creator's content of a period not started with the same 404 as before", async () => {
      const next = await content(renewed.next, 'not yours', 'scheduled', 20);

      const response = await post(
        `/contents/${next.id}/draft`,
        startsToday.creatorId,
        { link: DRAFT },
      );

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ code: 'CONTENT_NOT_FOUND' });
    });
  });
});
