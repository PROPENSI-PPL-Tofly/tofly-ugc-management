import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { as, signIn, signInAsAdmin } from './sessions.js';
import { day } from './days.js';

// Rows created here carry this marker so the cleanup never touches anything else in the
// database, seeded or not.
const MARKER = 'e2e-proposal-review';

describe('Proposal review and H-1 scheduling (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: ReturnType<typeof as>;
  let creator: ReturnType<typeof as>;
  let contractId: string;

  async function proposal(name: string, deadlineOffset: number): Promise<string> {
    const { id } = await prisma.contents.create({
      data: {
        contract_id: contractId,
        name: `${MARKER} ${name}`,
        type: 'specific',
        deadline: day(deadlineOffset),
        status: 'pending',
      },
      select: { id: true },
    });
    return id;
  }

  const statusOf = async (id: string) =>
    (await prisma.contents.findUnique({ where: { id }, select: { status: true } }))?.status;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    admin = as(app, await signInAsAdmin(app, prisma, MARKER));

    const user = await prisma.users.create({ data: { email: `${MARKER}-intan@example.com` } });
    const saved = await prisma.creators.create({
      data: {
        user_id: user.id,
        first_name: `${MARKER} Intan`,
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

  it('approves a pending proposal into a scheduled content, once', async () => {
    const id = await proposal('approve', 10);

    await expect(
      admin.patch(`/contents/${id}/proposal/approve`).expect(200).then((r) => r.body),
    ).resolves.toEqual({ id, status: 'scheduled' });
    expect(await statusOf(id)).toBe('scheduled');

    const { body } = await admin.patch(`/contents/${id}/proposal/approve`).expect(409);
    expect(body.code).toBe('PROPOSAL_NOT_PENDING');
  });

  it('removes a rejected proposal for good', async () => {
    const id = await proposal('reject', 10);

    await admin
      .post(`/contents/${id}/proposal/reject`)
      .send({ reason: 'Kurang relevan.' })
      .expect(200);

    expect(await prisma.contents.findUnique({ where: { id } })).toBeNull();
    await admin.post(`/contents/${id}/proposal/reject`).send({}).expect(404);
  });

  it('never lets a creator decide on their own proposal, and changes nothing', async () => {
    const id = await proposal('creator tries', 10);

    await creator.patch(`/contents/${id}/proposal/approve`).expect(403);
    await creator.post(`/contents/${id}/proposal/reject`).send({}).expect(403);

    expect(await statusOf(id)).toBe('pending');
  });

  it('refuses a decision sent from another origin, and changes nothing', async () => {
    const id = await proposal('cross origin', 10);
    const cookie = await signInAsAdmin(app, prisma, MARKER);

    await request(app.getHttpServer())
      .patch(`/contents/${id}/proposal/approve`)
      .set('Cookie', cookie)
      .set('Origin', 'https://evil.example')
      .set('Sec-Fetch-Site', 'cross-site')
      .expect(403);

    expect(await statusOf(id)).toBe('pending');
  });

  it('shows a proposal due tomorrow as scheduled, with the hand-ins the creator now has', async () => {
    const id = await proposal('due at H-1', 1);

    const { body } = await creator.get(`/me/contents/${id}`).expect(200);

    expect(body.status).toBe('scheduled');
    expect(body.creatorActions).toEqual(['submit_draft', 'submit_video']);
    expect(await statusOf(id)).toBe('scheduled');
  });

  it('leaves a proposal due later than tomorrow pending for the admin', async () => {
    const id = await proposal('due in two days', 2);

    const { body } = await admin.get(`/contents/${id}`).expect(200);

    expect(body.status).toBe('pending');
    expect(body.waitingOn).toBe('admin');
  });
});
