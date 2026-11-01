import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { DEV_CREATOR_HEADER } from '../src/auth/dev-creator.guard.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { day } from './days.js';
import { storedLink } from './links.js';

// Rows created here carry this marker so the cleanup never touches anything else.
const MARKER = 'e2e-links-api';

// One video per test: a video already linked from one content is refused on another (AC 5).
const reel = (name: string) =>
  `https://www.instagram.com/reel/${MARKER}-${name}/`;
let videoSeq = 7400000000000000000n;
const tiktok = () => `https://www.tiktok.com/@tofly/video/${(videoSeq += 1n)}`;

describe('content links API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: { creatorId: string; userId: string; contractId: string };
  let stranger: { creatorId: string; userId: string; contractId: string };
  let instagramOnly: { creatorId: string; userId: string; contractId: string };

  async function creator(
    name: string,
    platforms: ('instagram' | 'tiktok')[],
  ): Promise<{ creatorId: string; userId: string; contractId: string }> {
    const user = await prisma.users.create({
      data: {
        email: `${MARKER}-${name}@example.com`,
        creators: {
          create: {
            first_name: MARKER,
            last_name: name,
            social_accounts: {
              create: platforms.map((platform) => ({
                platform,
                username: `${MARKER}-${name}-${platform}`,
              })),
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

  function content(
    contractId: string,
    name: string,
    status: 'draft_approved' | 'draft_review' = 'draft_approved',
  ) {
    return prisma.contents.create({
      data: {
        contract_id: contractId,
        name: `${MARKER} ${name}`,
        type: 'specific',
        deadline: day(5),
        status,
      },
    });
  }

  /** A content whose Instagram link was handed in three days ago. */
  function linkedContent(name: string, url: string) {
    return prisma.contents.create({
      data: {
        contract_id: owner.contractId,
        name: `${MARKER} ${name}`,
        type: 'specific',
        deadline: day(-1),
        status: 'link_submitted',
        video_submitted_at: day(-3),
        content_links: {
          create: storedLink(url, day(-3), owner.userId, 'instagram'),
        },
      },
    });
  }

  function submit(contentId: string, links: object, as = owner.creatorId) {
    return request(app.getHttpServer())
      .post(`/contents/${contentId}/links`)
      .set(DEV_CREATOR_HEADER, as)
      .send({ links });
  }

  /** As a creator with the header, as the local admin stand-in without it. */
  function replace(
    contentId: string,
    platform: string,
    url: string,
    as?: string,
  ) {
    const call = request(app.getHttpServer()).put(
      `/contents/${contentId}/links/${platform}`,
    );
    return (as ? call.set(DEV_CREATOR_HEADER, as) : call).send({ url });
  }

  async function stateOf(contentId: string) {
    return prisma.contents.findUniqueOrThrow({
      where: { id: contentId },
      select: {
        status: true,
        video_submitted_at: true,
        content_links: {
          select: { platform: true, url: true, submitted_at: true },
          orderBy: { platform: 'asc' },
        },
        content_events: {
          select: { event_type: true, actor_role: true, event_data: true },
          orderBy: { occurred_at: 'asc' },
        },
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

    owner = await creator('owner', ['instagram', 'tiktok']);
    stranger = await creator('stranger', ['instagram', 'tiktok']);
    instagramOnly = await creator('ig-only', ['instagram']);
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    // Deleting a creator cascades to its contract, contents and links; users go separately.
    await prisma.creators.deleteMany({ where: { first_name: MARKER } });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARKER } } });
    await app.close();
  });

  describe('POST /contents/:id/links', () => {
    it('takes one link per platform at once: Link Dikirim today, one row and one timeline event per link (AC 1, 7, 12)', async () => {
      const approved = await content(owner.contractId, 'two links');
      const video = tiktok();

      const response = await submit(approved.id, {
        instagram: reel('two'),
        tiktok: video,
      });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        contentId: approved.id,
        status: 'link_submitted',
        submittedAt: day(0).toISOString().slice(0, 10),
        links: [
          {
            platform: 'instagram',
            url: reel('two'),
            submittedAt: day(0).toISOString().slice(0, 10),
          },
          {
            platform: 'tiktok',
            url: video,
            submittedAt: day(0).toISOString().slice(0, 10),
          },
        ],
      });
      const state = await stateOf(approved.id);
      expect(state.status).toBe('link_submitted');
      expect(state.video_submitted_at).toEqual(day(0));
      expect(state.content_links.map((link) => link.platform)).toEqual([
        'instagram',
        'tiktok',
      ]);
      expect(state.content_events).toEqual([
        {
          event_type: 'Link Submitted',
          actor_role: 'creator',
          event_data: { link: reel('two'), platform: 'instagram' },
        },
        {
          event_type: 'Link Submitted',
          actor_role: 'creator',
          event_data: { link: video, platform: 'tiktok' },
        },
      ]);
    });

    it('adds a later platform without moving the submitted day the lateness reads (AC 8)', async () => {
      const linked = await linkedContent('later', reel('later'));

      const response = await submit(linked.id, { tiktok: tiktok() });

      expect(response.status).toBe(201);
      expect(response.body.submittedAt).toBe(
        day(-3).toISOString().slice(0, 10),
      );
      const state = await stateOf(linked.id);
      expect(state.video_submitted_at).toEqual(day(-3));
      expect(state.content_links).toHaveLength(2);
    });

    it('refuses a second link for a platform that has one, pointing at replacing it', async () => {
      const linked = await linkedContent('exists', reel('exists'));

      const response = await submit(linked.id, { instagram: reel('exists-2') });

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ code: 'LINK_EXISTS' });
      expect((await stateOf(linked.id)).content_links).toHaveLength(1);
    });

    it('refuses a video already on another content, however it was copied, and writes nothing (AC 5)', async () => {
      await linkedContent('taken first', reel('taken'));
      const second = await content(owner.contractId, 'taken second');

      const response = await submit(second.id, {
        instagram: `https://instagram.com/p/${MARKER}-taken?igsh=copy`,
        tiktok: tiktok(),
      });

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        code: 'VIDEO_LINK_TAKEN',
        message: 'Link ini sudah dipakai di konten lain',
      });
      const state = await stateOf(second.id);
      expect(state.status).toBe('draft_approved');
      expect(state.content_links).toEqual([]);
      expect(state.content_events).toEqual([]);
    });

    it('answers every wrong field at once with its own message (AC 3, 4)', async () => {
      const approved = await content(owner.contractId, 'wrong fields');

      const response = await submit(approved.id, {
        instagram: 'https://www.tiktok.com/@tofly/video/1',
        tiktok: `https://www.tiktok.com/@tofly/video/${'9'.repeat(300)}`,
      });

      expect(response.status).toBe(422);
      expect(response.body.errors).toEqual({
        instagram:
          'Link harus dari Instagram (instagram.com/reel/... atau /p/...)',
        tiktok: 'Link maksimal 300 karakter',
      });
    });

    it('refuses a platform the creator has no account for (AC 3)', async () => {
      const approved = await content(instagramOnly.contractId, 'no tiktok');

      const response = await submit(
        approved.id,
        { tiktok: tiktok() },
        instagramOnly.creatorId,
      );

      expect(response.status).toBe(422);
      expect(response.body.errors).toEqual({
        tiktok: 'Creator belum punya akun TikTok',
      });
    });

    it("answers 404 on another creator's content, as if it did not exist (OWASP A01)", async () => {
      const theirs = await content(stranger.contractId, 'not mine');

      const response = await submit(theirs.id, { instagram: reel('idor') });

      expect(response.status).toBe(404);
      expect((await stateOf(theirs.id)).content_links).toEqual([]);
    });

    it('lets only one of two simultaneous first submits through (OWASP A04)', async () => {
      const approved = await content(owner.contractId, 'race');

      const answers = await Promise.all([
        submit(approved.id, { instagram: reel('race-a') }),
        submit(approved.id, { instagram: reel('race-b') }),
      ]);

      expect(answers.map((answer) => answer.status).sort()).toEqual([201, 409]);
      expect((await stateOf(approved.id)).content_links).toHaveLength(1);
    });

    it('counts a cross-posted content once toward the quota (AC 10)', async () => {
      const quota = await creator('quota', ['instagram', 'tiktok']);
      const crossPosted = await content(quota.contractId, 'cross-posted');
      await submit(
        crossPosted.id,
        { instagram: reel('quota'), tiktok: tiktok() },
        quota.creatorId,
      ).expect(201);

      const response = await request(app.getHttpServer()).get(
        `/creators?q=${encodeURIComponent(`${MARKER} quota`)}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].progress).toMatchObject({
        submitted: 1,
        total: 1,
      });
    });
  });

  describe('PUT /contents/:id/links/:platform', () => {
    it('lets the creator swap a link: new url dated today, submitted day kept, old and new link in the timeline (AC 8, 9)', async () => {
      const linked = await linkedContent('creator replace', reel('old-1'));

      const response = await replace(
        linked.id,
        'instagram',
        reel('new-1'),
        owner.creatorId,
      );

      expect(response.status).toBe(200);
      const state = await stateOf(linked.id);
      expect(state.video_submitted_at).toEqual(day(-3));
      expect(state.content_links).toEqual([
        { platform: 'instagram', url: reel('new-1'), submitted_at: day(0) },
      ]);
      expect(state.content_events).toEqual([
        {
          event_type: 'Link Replaced',
          actor_role: 'creator',
          event_data: {
            link: reel('new-1'),
            platform: 'instagram',
            previous_link: reel('old-1'),
          },
        },
      ]);
    });

    it('lets an admin swap a link, recorded as the admin, and frees the old video for another content', async () => {
      const linked = await linkedContent('admin replace', reel('old-2'));

      const response = await replace(linked.id, 'instagram', reel('new-2'));

      expect(response.status).toBe(200);
      expect((await stateOf(linked.id)).content_events[0].actor_role).toBe(
        'admin',
      );
      const other = await content(owner.contractId, 'reuses old video');
      await submit(other.id, { instagram: reel('old-2') }).expect(201);
    });

    it('shows the replaced link on Content Detail as a link step naming its platform', async () => {
      const linked = await linkedContent('detail', reel('old-3'));
      await replace(
        linked.id,
        'instagram',
        reel('new-3'),
        owner.creatorId,
      ).expect(200);

      const detail = await request(app.getHttpServer()).get(
        `/contents/${linked.id}`,
      );

      expect(detail.status).toBe(200);
      expect(detail.body.links).toEqual([
        {
          platform: 'instagram',
          url: reel('new-3'),
          submittedAt: day(0).toISOString().slice(0, 10),
        },
      ]);
      expect(detail.body.events[0]).toMatchObject({
        type: 'link_submitted',
        payload: { link: reel('new-3'), platform: 'instagram', replaced: true },
      });
    });

    it('answers 404 for a platform with no link yet, and for an unknown platform', async () => {
      const linked = await linkedContent('missing platform', reel('missing'));

      expect(
        (await replace(linked.id, 'tiktok', tiktok(), owner.creatorId)).body,
      ).toMatchObject({
        code: 'LINK_NOT_FOUND',
      });
      expect(
        (await replace(linked.id, 'youtube', reel('x'), owner.creatorId))
          .status,
      ).toBe(404);
    });

    it("answers 404 when a creator tries another creator's link (OWASP A01)", async () => {
      const linked = await linkedContent('idor replace', reel('idor-old'));

      const response = await replace(
        linked.id,
        'instagram',
        reel('idor-new'),
        stranger.creatorId,
      );

      expect(response.status).toBe(404);
      expect((await stateOf(linked.id)).content_links[0].url).toBe(
        reel('idor-old'),
      );
    });
  });

  describe('once the invoice is finalized (AC 8, 9)', () => {
    it('refuses a later link and a replacement, by creator and admin alike, and changes nothing', async () => {
      const frozen = await creator('frozen', ['instagram', 'tiktok']);
      const linked = await prisma.contents.create({
        data: {
          contract_id: frozen.contractId,
          name: `${MARKER} frozen`,
          type: 'specific',
          deadline: day(-1),
          status: 'link_submitted',
          video_submitted_at: day(-3),
          content_links: {
            create: storedLink(
              reel('frozen'),
              day(-3),
              frozen.userId,
              'instagram',
            ),
          },
        },
      });
      await prisma.invoices.create({
        data: {
          contract_id: frozen.contractId,
          status: 'finalized',
          finalized_at: new Date(),
          snapshot: {},
        },
      });

      const answers = [
        await submit(linked.id, { tiktok: tiktok() }, frozen.creatorId),
        await replace(
          linked.id,
          'instagram',
          reel('frozen-new'),
          frozen.creatorId,
        ),
        await replace(linked.id, 'instagram', reel('frozen-new')),
      ];

      for (const answer of answers) {
        expect(answer.status).toBe(409);
        expect(answer.body).toEqual({
          code: 'INVOICE_FINALIZED',
          message:
            'Invoice sudah difinalisasi. Link video tidak bisa diubah lagi',
        });
      }
      const state = await stateOf(linked.id);
      expect(state.content_links).toEqual([
        { platform: 'instagram', url: reel('frozen'), submitted_at: day(-3) },
      ]);
      expect(state.content_events).toEqual([]);
    });
  });
});
