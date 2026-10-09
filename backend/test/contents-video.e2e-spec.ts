import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { DEV_CREATOR_HEADER } from '../src/auth/dev-creator.guard.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { jakartaMidnight } from '../src/creators/evergreen.js';

// Rows created here carry this marker so the cleanup never touches anything else.
const MARKER = 'e2e-video';

const DAY = 24 * 60 * 60 * 1000;
const REEL = 'https://www.instagram.com/reel/e2e-video/';

function daysFromToday(days: number): Date {
  // Today in Jakarta, the day the app counts from.
  return new Date(jakartaMidnight(new Date()).getTime() + days * DAY);
}

describe('POST /contents/:id/video (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerId: string;
  let contractId: string;

  async function content(
    name: string,
    status: 'scheduled' | 'draft_approved',
  ) {
    return prisma.contents.create({
      data: {
        contract_id: contractId,
        name: `${MARKER} ${name}`,
        type: 'specific',
        // Tomorrow: inside the H-1 window, so an unapproved content may hand in its link.
        deadline: daysFromToday(1),
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

  async function stateOf(contentId: string) {
    return prisma.contents.findUniqueOrThrow({
      where: { id: contentId },
      select: { status: true, video_link: true, approval_bypassed: true },
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

    const user = await prisma.users.create({
      data: {
        email: `${MARKER}-owner@example.com`,
        creators: {
          create: {
            first_name: MARKER,
            last_name: 'owner',
            contracts: {
              create: {
                start_date: daysFromToday(-30),
                end_date: daysFromToday(90),
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

  it('marks a link handed in from scheduled inside H-1 as approval bypassed', async () => {
    const scheduled = await content('scheduled', 'scheduled');

    const response = await handIn(scheduled.id, { link: REEL });

    expect(response.status).toBe(201);
    expect(await stateOf(scheduled.id)).toEqual({
      status: 'link_submitted',
      video_link: REEL,
      approval_bypassed: true,
    });
  });

  it('does not mark a link handed in after the draft was approved', async () => {
    const approved = await content('approved', 'draft_approved');

    const response = await handIn(approved.id, { link: REEL });

    expect(response.status).toBe(201);
    expect(await stateOf(approved.id)).toEqual({
      status: 'link_submitted',
      video_link: REEL,
      approval_bypassed: false,
    });
  });

  it('ignores approval_bypassed and status in the request body (OWASP A08)', async () => {
    const scheduled = await content('mass assignment', 'scheduled');

    const response = await handIn(scheduled.id, {
      link: REEL,
      approval_bypassed: false,
      status: 'draft_approved',
    });

    expect(response.status).toBe(201);
    expect(await stateOf(scheduled.id)).toEqual({
      status: 'link_submitted',
      video_link: REEL,
      approval_bypassed: true,
    });
  });
});
