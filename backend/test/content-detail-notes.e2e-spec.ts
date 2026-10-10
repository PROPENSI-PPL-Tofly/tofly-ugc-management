import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { as, signIn, signInAsAdmin } from './sessions.js';
import { day } from './days.js';

// Rows created here carry this marker so the cleanup never touches anything else in the
// database, seeded or not.
const MARKER = 'e2e-detail-notes';

describe('GET /contents/:id and /me/contents/:id draft notes (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: ReturnType<typeof as>;
  let creator: ReturnType<typeof as>;
  let contentId: string;

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
    const saved = await prisma.creators.create({
      data: {
        user_id: user.id,
        first_name: `${MARKER} Dewi`,
        contracts: {
          create: {
            start_date: day(-30),
            end_date: day(30),
            contract_type: 'regular',
            days_between: 14,
            content_quota: 1,
            fixed_rate: 100000,
            contents: {
              create: [
                {
                  name: 'Revised once',
                  type: 'evergreen',
                  deadline: day(10),
                  status: 'draft_review',
                },
              ],
            },
          },
        },
      },
      select: { id: true, contracts: { select: { contents: { select: { id: true } } } } },
    });
    contentId = saved.contracts[0].contents[0].id;
    creator = as(
      app,
      await signIn(app, { userId: user.id, role: 'creator', creatorId: saved.id }),
    );

    await prisma.submissions.createMany({
      data: [
        {
          content_id: contentId,
          creator_id: saved.id,
          link: 'https://example.com/draft-1',
          creator_notes: '   ',
          revision_notes: 'Hook kurang kuat.',
          created_at: day(-3),
          updated_at: day(-2),
        },
        {
          content_id: contentId,
          creator_id: saved.id,
          link: 'https://example.com/draft-2',
          creator_notes: 'Hook sudah diganti.',
          created_at: day(-1),
          updated_at: day(-1),
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

  const drafts = (body: { events: { type: string; payload?: unknown }[] }) =>
    body.events
      .filter((event) => event.type === 'draft_submitted')
      .map((event) => event.payload);

  it("shows the admin each draft's note from the creator, leaving a blank one out", async () => {
    const { body } = await admin.get(`/contents/${contentId}`).expect(200);

    expect(drafts(body)).toEqual([
      { version: 2, link: 'https://example.com/draft-2', note: 'Hook sudah diganti.' },
      { version: 1, link: 'https://example.com/draft-1' },
    ]);
  });

  it('shows the creator the same notes on their own content', async () => {
    const { body } = await creator.get(`/me/contents/${contentId}`).expect(200);

    expect(drafts(body)).toEqual([
      { version: 2, link: 'https://example.com/draft-2', note: 'Hook sudah diganti.' },
      { version: 1, link: 'https://example.com/draft-1' },
    ]);
  });
});
