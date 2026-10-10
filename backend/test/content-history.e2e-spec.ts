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
const MARKER = 'e2e-content-history';

describe('Content history read back into the detail (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: ReturnType<typeof as>;
  let creator: ReturnType<typeof as>;
  let contractId: string;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    admin = as(app, await signInAsAdmin(app, prisma, MARKER));

    const user = await prisma.users.create({ data: { email: `${MARKER}-dewi@example.com` } });
    const saved = await prisma.creators.create({
      data: {
        user_id: user.id,
        first_name: `${MARKER} Dewi`,
        contracts: {
          create: {
            start_date: day(-30),
            end_date: day(60),
            contract_type: 'regular',
            days_between: 14,
            content_quota: 4,
            fixed_rate: 100000,
          },
        },
      },
      select: { id: true, contracts: { select: { id: true } } },
    });
    contractId = saved.contracts[0].id;
    creator = as(
      app,
      await signIn(app, { userId: user.id, role: 'creator', creatorId: saved.id }),
    );
  });

  afterAll(async () => {
    await prisma.creators.deleteMany({ where: { first_name: { startsWith: MARKER } } });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARKER } } });
    await app.close();
  });

  it('keeps the approval in the timeline once the link is in, naming the admin only as Admin', async () => {
    const { id } = await admin
      .post('/contents')
      .send({
        contractId,
        type: 'specific',
        name: `${MARKER} Unboxing`,
        brief: 'Unboxing paket.',
        deadline: day(20).toISOString().slice(0, 10),
      })
      .expect(201)
      .then((response) => response.body as { id: string });

    const { submissionId } = await creator
      .post(`/contents/${id}/draft`)
      .send({ link: 'https://drive.google.com/file/d/history-v1', notes: 'Versi pertama.' })
      .expect(201)
      .then((response) => response.body as { submissionId: string });
    await admin.patch(`/submissions/${submissionId}/approve`).expect(200);
    await creator
      .post(`/contents/${id}/video`)
      .send({ link: 'https://www.tiktok.com/@dewi/video/7400000000000000001' })
      .expect(201);

    // Read one at a time: each read starts its own request only when it is awaited.
    const readers = [() => admin.get(`/contents/${id}`), () => creator.get(`/me/contents/${id}`)];
    for (const read of readers) {
      const { body } = await read().expect(200);

      // Every step is kept, the approval included. Their order on the link's day is not asserted
      // here: the Link Submitted event still stores midnight of its day.
      type Step = { type: string; actor: unknown; payload?: unknown };
      const byType = (type: string) => body.events.find((event: Step) => event.type === type);
      expect(body.events.map((event: Step) => event.type).sort()).toEqual([
        'draft_approved',
        'draft_submitted',
        'link_submitted',
        'scheduled',
      ]);
      expect(byType('draft_submitted').payload).toMatchObject({ version: 1, note: 'Versi pertama.' });
      expect(byType('draft_approved').actor).toEqual({ name: null, role: 'admin' });
      expect(JSON.stringify(body)).not.toContain('@example.com');
    }

    const stored = await prisma.content_events.findMany({ where: { content_id: id } });
    expect(stored.filter((event) => event.actor_role === 'admin')).toEqual(
      expect.arrayContaining([expect.objectContaining({ actor_name: 'Admin' })]),
    );
    expect(stored.every((event) => !event.actor_name.includes('@'))).toBe(true);
  });

  it('records an approved proposal as its own step after the creator proposed it', async () => {
    const proposal = await prisma.contents.create({
      data: {
        contract_id: contractId,
        name: `${MARKER} Ide`,
        type: 'specific',
        deadline: day(15),
        status: 'pending',
        content_events: {
          create: {
            event_type: 'Scheduled',
            actor_name: `${MARKER} Dewi`,
            actor_role: 'creator',
            event_data: {},
          },
        },
      },
      select: { id: true },
    });

    await admin.patch(`/contents/${proposal.id}/proposal/approve`).expect(200);

    const { body } = await admin.get(`/contents/${proposal.id}`).expect(200);
    expect(body.events.map((event: { type: string; actor: unknown }) => [event.type, event.actor])).toEqual([
      ['proposal_approved', { name: null, role: 'admin' }],
      ['scheduled', { name: `${MARKER} Dewi`, role: 'creator' }],
    ]);
  });
});
