import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaEmailLogStore } from '../src/email/email-log-store.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { day } from './days.js';
import { as, signInAsAdmin } from './sessions.js';

// PBI-11 11.3 against the real schema: the 08:00 WIB run's guard, its H-1 reminder and the
// email_log row that keeps a second run from sending again. No SMTP account is configured here
// (and no FRONTEND_URL for 11.4's buttons), so every email is logged as failed, not ready,
// instead of reaching anyone.

const MARKER = 'e2e-email-run';
const SECRET = `${MARKER}-secret-long-enough-for-the-guard-0123456789`;

describe('the 08:00 email run (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let contractId: string;

  async function dueContent(offset: number, status: 'scheduled' | 'link_submitted') {
    return prisma.contents.create({
      data: {
        contract_id: contractId,
        name: `${MARKER} content`,
        type: 'evergreen',
        deadline: day(offset),
        status,
      },
    });
  }

  function reminderRows(contentId: string) {
    return prisma.email_log.findMany({
      where: { event_key: { startsWith: `deadline_reminder:${contentId}:` } },
    });
  }

  function runWith(headers: Record<string, string>) {
    return request(app.getHttpServer()).post('/internal/email-run').set(headers);
  }

  beforeAll(async () => {
    vi.stubEnv('DEV_AUTH_ENABLED', '');
    vi.stubEnv('PERFORMANCE_SYNC_SECRET', SECRET);
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    admin = await signInAsAdmin(app, prisma, MARKER);

    const user = await prisma.users.create({
      data: {
        email: `${MARKER}-salsa@example.com`,
        creators: {
          create: {
            first_name: MARKER,
            last_name: 'Salsa',
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
    contractId = user.creators!.contracts[0].id;
  });

  afterAll(async () => {
    await prisma.email_log.deleteMany({ where: { recipient: { startsWith: MARKER } } });
    await prisma.creators.deleteMany({ where: { first_name: MARKER } });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARKER } } });
    await app.close();
    vi.unstubAllEnvs();
  });

  it.each([
    ['no secret header', {}],
    ['a wrong secret', { 'x-sync-secret': `${SECRET}x` }],
  ])('refuses %s with 401 (OWASP A07)', async (_, headers) => {
    const response = await runWith(headers);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ code: 'SYNC_SECRET_INVALID', message: 'Unauthorized' });
  });

  it('ignores an admin session: the secret is the only way in', async () => {
    expect((await as(app, admin).post('/internal/email-run')).status).toBe(401);
  });

  // AC 2 and AC 8: one reminder for content due tomorrow without a link, even over two runs.
  it("reminds content due tomorrow once, with the scheduler's secret", async () => {
    const due = await dueContent(1, 'scheduled');
    const delivered = await dueContent(1, 'link_submitted');
    const later = await dueContent(2, 'scheduled');

    const first = await runWith({ 'x-sync-secret': SECRET });
    const second = await runWith({ 'x-sync-secret': SECRET });

    expect(first.status).toBe(200);
    expect(first.body).toEqual({
      retried: expect.any(Number),
      resent: expect.any(Number),
      reminded: expect.any(Number),
    });
    expect(second.status).toBe(200);
    const rows = await reminderRows(due.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      template: 'deadline_reminder',
      recipient: `${MARKER}-salsa@example.com`,
      status: 'failed',
    });
    expect(await reminderRows(delivered.id)).toEqual([]);
    expect(await reminderRows(later.id)).toEqual([]);
  });

  // Review on #252 (Davin): with no SMTP account here, nothing is attempted, so every run
  // tries the reminder again without using up its 3 attempts.
  it('keeps a reminder that could not be sent for the next run, using no attempt while email is not set up', async () => {
    const due = await dueContent(1, 'scheduled');

    for (let run = 0; run < 4; run += 1) {
      await runWith({ 'x-sync-secret': SECRET });
    }

    const rows = await reminderRows(due.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'failed', attempts: 0, last_error: 'PortNotReady' });
  });

  // Review on #253 (Davin, Gunta): two runs at once claim a failed row once, so it is sent once.
  it('lets only one of two runs at once claim a failed email', async () => {
    const store = new PrismaEmailLogStore(prisma);
    const email = {
      eventKey: `${MARKER}-claim-${Date.now()}`,
      template: 'content_scheduled',
      recipient: `${MARKER}-salsa@example.com`,
      payload: {},
    };
    await store.claim(email);
    await store.markFailed(email.eventKey, email.recipient, 'ESOCKET', new Date());

    const claims = await Promise.all([
      store.claimRetry(email, new Date()),
      store.claimRetry(email, new Date()),
    ]);

    expect(claims.filter(Boolean)).toHaveLength(1);
  });
});
