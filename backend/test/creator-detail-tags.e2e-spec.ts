import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { as, signInAsAdmin } from './sessions.js';
import { jakartaMidnight } from '../src/creators/evergreen.js';

// Rows created here carry this marker so the cleanup never touches anything else in the
// database, seeded or not.
const MARKER = 'e2e-detail-tags';

/** A calendar day relative to today in Jakarta, the day the app counts from. */
function day(offset: number): Date {
  const today = jakartaMidnight(new Date());
  return new Date(
    Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate() + offset,
    ),
  );
}

describe('GET /creators/:id content tags (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: ReturnType<typeof as>;
  let creatorId: string;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    admin = as(app, await signInAsAdmin(app, prisma, MARKER));

    const user = await prisma.users.create({
      data: { email: `${MARKER}-dewi@example.com` },
    });
    const creator = await prisma.creators.create({
      data: {
        user_id: user.id,
        first_name: `${MARKER} Dewi`,
        contracts: {
          create: {
            start_date: day(-30),
            end_date: day(30),
            contract_type: 'regular',
            days_between: 14,
            content_quota: 4,
            fixed_rate: 100000,
            contents: {
              create: [
                {
                  name: 'Late link, bypassed',
                  type: 'evergreen',
                  deadline: day(-10),
                  status: 'link_submitted',
                  video_link: 'https://example.com/late',
                  video_submitted_at: day(-8),
                  approval_bypassed: true,
                },
                {
                  name: 'Overdue',
                  type: 'evergreen',
                  deadline: day(-3),
                },
                {
                  name: 'Late draft, overdue',
                  type: 'evergreen',
                  deadline: day(-6),
                  status: 'draft_review',
                },
                { name: 'Open', type: 'specific', deadline: day(10) },
              ],
            },
          },
        },
      },
      select: { id: true, contracts: { select: { contents: true } } },
    });
    creatorId = creator.id;

    const lateDraft = creator.contracts[0].contents.find(
      (content) => content.name === 'Late draft, overdue',
    );
    await prisma.submissions.createMany({
      data: [
        {
          content_id: lateDraft!.id,
          creator_id: creator.id,
          link: 'https://example.com/draft-1',
          created_at: day(-7),
        },
        {
          content_id: lateDraft!.id,
          creator_id: creator.id,
          link: 'https://example.com/draft-2',
          created_at: day(-2),
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.creators.deleteMany({
      where: { first_name: { startsWith: MARKER } },
    });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARKER } } });
    await app.close();
  });

  it('returns each content of the current contract with its tags', async () => {
    const { body } = await admin.get(`/creators/${creatorId}`).expect(200);

    expect(
      Object.fromEntries(
        body.contents.map((content: { name: string; tags: string[] }) => [
          content.name,
          content.tags,
        ]),
      ),
    ).toEqual({
      'Late link, bypassed': ['late_submission', 'approval_bypassed'],
      Overdue: ['overdue'],
      'Late draft, overdue': ['late_submission', 'overdue'],
      Open: [],
    });
  });
});
