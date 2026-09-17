import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

// My Task (PBI-20) against a real database: the list, the draft and video submissions, and
// the rules between them. Like creators.e2e-spec, it seeds what it needs and removes it again.
//
// TODO(PBI-9): requests identify the creator with the dev-only X-Dev-Creator-Id header, and
// the admin's side of the review ("Minta Revisi", Approve) is written straight to the
// database because those endpoints belong to another PBI. Swap both for the real thing once
// auth and the Draft Review Dashboard land.
describe('My Task (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let creatorId: string;
  let otherCreatorId: string;
  let contractId: string;

  const emails = ['e2e-mytask@example.com', 'e2e-mytask-other@example.com'];
  const HEADER = 'x-dev-creator-id';
  const REEL = 'https://www.instagram.com/reel/C8e2e/';
  const DRAFT = 'https://drive.google.com/file/d/e2e/view';

  function day(offset: number): Date {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() + offset);
    return date;
  }

  async function cleanup() {
    await prisma.creator.deleteMany({
      where: { user: { email: { in: emails } } },
    });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
  }

  async function createCreator(email: string, firstName: string) {
    const user = await prisma.user.create({
      data: {
        email,
        creator: {
          create: {
            firstName,
            contracts: {
              create: {
                startDate: day(-30),
                endDate: day(150),
                daysBetween: 14,
                contentQuota: 10,
                fixedRate: 500000,
              },
            },
          },
        },
      },
      select: {
        creator: { select: { id: true, contracts: { select: { id: true } } } },
      },
    });
    return { id: user.creator!.id, contractId: user.creator!.contracts[0].id };
  }

  async function content(
    name: string,
    deadlineOffset: number,
    extra: Record<string, unknown> = {},
  ) {
    const row = await prisma.content.create({
      data: {
        contractId,
        name,
        type: 'evergreen',
        deadline: day(deadlineOffset),
        ...extra,
      },
      select: { id: true },
    });
    return row.id;
  }

  const as = (id: string) => ({ [HEADER]: id });
  const list = (query: Record<string, number> = {}) =>
    request(app.getHttpServer())
      .get('/me/contents')
      .set(as(creatorId))
      .query(query);
  const postDraft = (id: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`/contents/${id}/draft`)
      .set(as(creatorId))
      .send(body);
  const postVideo = (id: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`/contents/${id}/video`)
      .set(as(creatorId))
      .send(body);

  beforeAll(async () => {
    // TODO(PBI-9): the dev auth stub is off unless switched on, exactly as in production.
    process.env.DEV_AUTH_ENABLED = 'true';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    await cleanup();

    const creator = await createCreator(emails[0], 'E2E MyTask');
    creatorId = creator.id;
    contractId = creator.contractId;
    otherCreatorId = (await createCreator(emails[1], 'E2E Lain')).id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  beforeEach(async () => {
    await prisma.content.deleteMany({ where: { contractId } });
  });

  describe('GET /me/contents', () => {
    it('pages five at a time, nearest deadline first, across pages', async () => {
      // Created out of order on purpose.
      for (const offset of [40, 3, 25, -10, 12, 7, 60]) {
        await content(`Konten H${offset}`, offset);
      }

      const first = await list().expect(200);
      const second = await list({ page: 2 }).expect(200);

      expect(first.body).toMatchObject({
        page: 1,
        pageSize: 5,
        total: 7,
        totalPages: 2,
      });
      expect(
        first.body.items.map((item: { name: string }) => item.name),
      ).toEqual([
        'Konten H-10',
        'Konten H3',
        'Konten H7',
        'Konten H12',
        'Konten H25',
      ]);
      expect(
        second.body.items.map((item: { name: string }) => item.name),
      ).toEqual(['Konten H40', 'Konten H60']);
    });

    it('leaves out pending proposals and other creators’ content', async () => {
      await content('Milik saya', 5);
      await content('Usulan belum disetujui', 5, { isProposal: true });

      const mine = await list().expect(200);
      const theirs = await request(app.getHttpServer())
        .get('/me/contents')
        .set(as(otherCreatorId))
        .expect(200);

      expect(
        mine.body.items.map((item: { name: string }) => item.name),
      ).toEqual(['Milik saya']);
      expect(theirs.body.total).toBe(0);
    });

    it('refuses a caller who is not a known creator', async () => {
      await request(app.getHttpServer())
        .get('/me/contents')
        .set(HEADER, '11111111-1111-4111-8111-111111111111')
        .expect(401);
      await request(app.getHttpServer())
        .get('/me/contents')
        .set(HEADER, 'bukan-uuid')
        .expect(401);
    });

    it('rejects a page size beyond the cap', async () => {
      await list({ pageSize: 51 }).expect(400);
    });
  });

  describe('the full lifecycle', () => {
    it('Scheduled → draft → revision → resubmit → approved → video submitted', async () => {
      const id = await content('Siklus lengkap', 20);

      // Scheduled: only the draft is open.
      let row = (await list()).body.items[0];
      expect(row).toMatchObject({
        status: 'scheduled',
        actions: {
          canSubmitDraft: true,
          isResubmission: false,
          canSubmitVideo: false,
        },
      });
      await postVideo(id, { link: REEL }).expect(409);

      // Draft submitted, with the creator's note.
      const draft = await postDraft(id, {
        link: DRAFT,
        creatorNotes: 'Versi pertama',
      }).expect(201);
      expect(draft.body).toMatchObject({
        status: 'draft_review',
        latestDraft: {
          link: DRAFT,
          creatorNotes: 'Versi pertama',
          revisionCount: 0,
        },
        actions: { canSubmitDraft: false, canSubmitVideo: false },
      });
      await postDraft(id, { link: DRAFT }).expect(409);

      // Admin asks for a revision (simulated, see TODO at the top).
      const [first] = await prisma.submission.findMany({
        where: { contentId: id },
      });
      await prisma.submission.update({
        where: { id: first.id },
        data: { revisionNotes: 'Hook kurang kuat' },
      });
      await prisma.content.update({
        where: { id },
        data: { status: 'draft_revision' },
      });

      row = (await list()).body.items[0];
      expect(row).toMatchObject({
        status: 'draft_revision',
        latestDraft: { revisionNotes: 'Hook kurang kuat' },
        actions: {
          canSubmitDraft: true,
          isResubmission: true,
          canSubmitVideo: false,
        },
      });

      // Resubmitted: back in review, and the first hand-in now counts as one revision.
      const resubmit = await postDraft(id, { link: `${DRAFT}?v=2` }).expect(
        201,
      );
      expect(resubmit.body).toMatchObject({
        status: 'draft_review',
        latestDraft: {
          link: `${DRAFT}?v=2`,
          creatorNotes: null,
          revisionCount: 1,
        },
      });

      // Admin approves (simulated).
      await prisma.content.update({
        where: { id },
        data: { status: 'draft_approved' },
      });
      row = (await list()).body.items[0];
      expect(row.actions).toMatchObject({
        canSubmitDraft: false,
        canSubmitVideo: true,
      });

      // Video link: wrong platform refused, then accepted with no further approval.
      await postVideo(id, { link: 'https://youtube.com/shorts/abc' }).expect(
        400,
      );
      const video = await postVideo(id, { link: REEL }).expect(201);
      expect(video.body).toMatchObject({
        status: 'link_submitted',
        videoLink: REEL,
        platform: 'instagram',
        actions: {
          canSubmitDraft: false,
          canSubmitVideo: false,
          inGracePeriod: false,
        },
      });

      const stored = await prisma.content.findUniqueOrThrow({ where: { id } });
      expect(stored.videoSubmittedAt?.toISOString().slice(0, 10)).toBe(
        day(0).toISOString().slice(0, 10),
      );
      expect(await prisma.submission.count({ where: { contentId: id } })).toBe(
        2,
      );

      // Done means done.
      await postVideo(id, { link: REEL }).expect(409);
      await postDraft(id, { link: DRAFT }).expect(409);
    });
  });

  describe('the H-1 grace window', () => {
    it('stays closed two days before the deadline without an approved draft', async () => {
      const id = await content('H-2', 2);

      const response = await postVideo(id, { link: REEL }).expect(409);

      expect(response.body.code).toBe('VIDEO_NOT_ALLOWED');
      expect((await list()).body.items[0].actions).toMatchObject({
        canSubmitVideo: false,
        inGracePeriod: false,
      });
    });

    it.each([1, 0, -1])(
      'lets a video through with no draft ever submitted (deadline in %i days)',
      async (offset) => {
        const id = await content(`Grace ${offset}`, offset);
        expect((await list()).body.items[0].actions).toMatchObject({
          canSubmitVideo: true,
          inGracePeriod: true,
        });

        const response = await postVideo(id, {
          link: 'https://www.tiktok.com/@tofly.id/video/7412345678901234567',
        }).expect(201);

        expect(response.body).toMatchObject({
          status: 'link_submitted',
          platform: 'tiktok',
        });
        expect(
          await prisma.submission.count({ where: { contentId: id } }),
        ).toBe(0);
      },
    );

    it('still refuses a draft in the grace window once one is under review', async () => {
      const id = await content('Grace draft', 1, { status: 'draft_review' });

      await postDraft(id, { link: DRAFT }).expect(409);
      await postVideo(id, { link: REEL }).expect(201);
    });
  });

  describe('input and ownership', () => {
    it.each([
      [{ link: 'https://instagram.com.evil.example/reel/1' }],
      [{ link: 'instagram.com/reel/1' }],
      [{ link: 'javascript://instagram.com/%0Aalert(1)' }],
      [{}],
      [{ link: REEL, platform: 'tiktok' }],
    ])('refuses the video body %o and changes nothing', async (body) => {
      const id = await content('Link aneh', 10, { status: 'draft_approved' });

      await postVideo(id, body).expect(400);

      const stored = await prisma.content.findUniqueOrThrow({ where: { id } });
      expect(stored).toMatchObject({
        status: 'draft_approved',
        videoLink: null,
        platform: null,
      });
    });

    it.each([
      [{}],
      [{ link: 'bukan link' }],
      [{ link: DRAFT, creatorNotes: 'x'.repeat(1001) }],
    ])('refuses the draft body %o', async (body) => {
      const id = await content('Draft aneh', 10);

      await postDraft(id, body).expect(400);
      expect(await prisma.submission.count({ where: { contentId: id } })).toBe(
        0,
      );
    });

    it('answers 404 for another creator’s content, and leaves it untouched', async () => {
      const id = await content('Bukan milikmu', 1, {
        status: 'draft_approved',
      });

      await request(app.getHttpServer())
        .post(`/contents/${id}/video`)
        .set(as(otherCreatorId))
        .send({ link: REEL })
        .expect(404);
      await request(app.getHttpServer())
        .post(`/contents/${id}/draft`)
        .set(as(otherCreatorId))
        .send({ link: DRAFT })
        .expect(404);

      expect(
        await prisma.content.findUniqueOrThrow({ where: { id } }),
      ).toMatchObject({
        status: 'draft_approved',
      });
    });

    it('answers 404 for a pending proposal', async () => {
      const id = await content('Usulan', 1, { isProposal: true });

      await postDraft(id, { link: DRAFT }).expect(404);
    });

    it('refuses a malformed content id', async () => {
      await postDraft('bukan-uuid', { link: DRAFT }).expect(400);
    });

    it('lets only one of two simultaneous draft submits through', async () => {
      const id = await content('Balapan', 10);

      const results = await Promise.all([
        postDraft(id, { link: `${DRAFT}?a` }),
        postDraft(id, { link: `${DRAFT}?b` }),
      ]);

      expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
      expect(await prisma.submission.count({ where: { contentId: id } })).toBe(
        1,
      );
    });
  });
});
