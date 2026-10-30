import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { DEV_CREATOR_HEADER } from '../src/auth/dev-creator.guard.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { day } from './days.js';

// Rows created here carry this marker so the cleanup never touches anything else.
const MARKER = 'e2e-video';

// One video per test: a video already linked from one content is refused on another (AC 5).
const reel = (name: string) => `https://www.instagram.com/reel/e2e-video-${name}/`;
const DRAFT = 'https://drive.google.com/file/d/e2e-video-draft';

describe('POST /contents/:id/video (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerId: string;
  let contractId: string;

  async function content(
    name: string,
    status: 'scheduled' | 'draft_review' | 'draft_revision' | 'draft_approved',
  ) {
    return prisma.contents.create({
      data: {
        contract_id: contractId,
        name: `${MARKER} ${name}`,
        type: 'specific',
        // Tomorrow: inside the H-1 window, where a link may skip the approval of a draft.
        deadline: day(1),
        status,
      },
    });
  }

  function handIn(contentId: string, body: object) {
    return request(app.getHttpServer())
      .post(`/contents/${contentId}/video`)
      .set(DEV_CREATOR_HEADER, ownerId)
      .send(body);
  }

  /** The content's status and bypass flag, and its one link if any, read from content_links. */
  async function stateOf(contentId: string) {
    const { content_links, ...content } = await prisma.contents.findUniqueOrThrow({
      where: { id: contentId },
      select: {
        status: true,
        approval_bypassed: true,
        content_links: { select: { url: true, platform: true } },
      },
    });
    return { ...content, video_link: content_links[0]?.url ?? null };
  }

  beforeAll(async () => {
    vi.stubEnv('DEV_AUTH_ENABLED', 'true');
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const user = await prisma.users.create({
      data: {
        email: `${MARKER}-owner@example.com`,
        creators: {
          create: {
            first_name: MARKER,
            last_name: 'owner',
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
    ownerId = user.creators!.id;
    contractId = user.creators!.contracts[0].id;
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    // Deleting the creator cascades to its contract and contents; the user row goes separately.
    await prisma.creators.deleteMany({ where: { first_name: MARKER } });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARKER } } });
    await app.close();
  });

  // The two hand-ins as a creator makes them at H-1: the draft first, then the link without
  // waiting for the admin (PBI-7 7.2).
  it('takes a link at H-1 once the draft is handed in, and marks the approval as bypassed', async () => {
    const scheduled = await content('draft then link', 'scheduled');
    await request(app.getHttpServer())
      .post(`/contents/${scheduled.id}/draft`)
      .set(DEV_CREATOR_HEADER, ownerId)
      .send({ link: DRAFT })
      .expect(201);

    const response = await handIn(scheduled.id, { link: reel('h1') });

    expect(response.status).toBe(201);
    expect(await stateOf(scheduled.id)).toEqual({
      status: 'link_submitted',
      video_link: reel('h1'),
      approval_bypassed: true,
    });
  });

  it.each([
    ['no draft has been handed in', 'scheduled', 'Kirim draft dulu sebelum mengirim link video'],
    [
      'a revision is still owed',
      'draft_revision',
      'Kirim ulang draft dulu sebelum mengirim link video',
    ],
  ] as const)(
    'refuses a link at H-1 while %s, says what to send first, and changes nothing',
    async (_why, status, message) => {
      const waiting = await content(`refused ${status}`, status);

      const response = await handIn(waiting.id, { link: reel(`refused-${status}`) });

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ code: 'VIDEO_NOT_ELIGIBLE', message });
      expect(await stateOf(waiting.id)).toEqual({
        status,
        video_link: null,
        approval_bypassed: false,
      });
      expect(
        await prisma.content_events.count({ where: { content_id: waiting.id } }),
      ).toBe(0);
    },
  );

  it('does not mark a link handed in after the draft was approved', async () => {
    const approved = await content('approved', 'draft_approved');

    const response = await handIn(approved.id, { link: reel('approved') });

    expect(response.status).toBe(201);
    expect(await stateOf(approved.id)).toEqual({
      status: 'link_submitted',
      video_link: reel('approved'),
      approval_bypassed: false,
    });
  });

  it('ignores approval_bypassed and status in the request body (OWASP A08)', async () => {
    const inReview = await content('mass assignment', 'draft_review');

    const response = await handIn(inReview.id, {
      link: reel('mass-assignment'),
      approval_bypassed: false,
      status: 'draft_approved',
    });

    expect(response.status).toBe(201);
    expect(await stateOf(inReview.id)).toEqual({
      status: 'link_submitted',
      video_link: reel('mass-assignment'),
      approval_bypassed: true,
    });
  });

  it('stores the link in content_links with its platform, and no longer in contents.video_link', async () => {
    const approved = await content('stored', 'draft_approved');

    await handIn(approved.id, { link: reel('stored') }).expect(201);

    expect(
      await prisma.content_links.findMany({
        where: { content_id: approved.id },
        select: { platform: true, url: true, normalized_url: true, submitted_at: true },
      }),
    ).toEqual([
      {
        platform: 'instagram',
        url: reel('stored'),
        normalized_url: 'instagram:e2e-video-stored',
        submitted_at: day(0),
      },
    ]);
    expect(
      await prisma.contents.findUniqueOrThrow({
        where: { id: approved.id },
        select: { video_link: true, platform: true, video_submitted_at: true },
      }),
    ).toEqual({ video_link: null, platform: null, video_submitted_at: day(0) });
  });

  it('refuses a video already linked from another content, however it was copied, and leaves the second content as it was (AC 5)', async () => {
    const first = await content('taken first', 'draft_approved');
    const second = await content('taken second', 'draft_approved');
    await handIn(first.id, { link: reel('taken') }).expect(201);

    const response = await handIn(second.id, {
      link: 'http://instagram.com/reel/e2e-video-taken?igsh=copy',
    });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: 'VIDEO_LINK_TAKEN',
      message: 'Link ini sudah dipakai di konten lain',
    });
    expect(await stateOf(second.id)).toEqual({
      status: 'draft_approved',
      video_link: null,
      approval_bypassed: false,
    });
    expect(
      await prisma.content_events.count({ where: { content_id: second.id } }),
    ).toBe(0);
  });
});
