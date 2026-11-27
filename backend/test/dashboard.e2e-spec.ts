import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { as, signIn, signInAsAdmin } from './sessions.js';

const MARKER = 'e2e-dashboard';
const DAY = 24 * 60 * 60 * 1000;

// PBI-24 over HTTP: the range arrives as text, so ?range=3 must read as three months.
describe('dashboards (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let creator: string;

  beforeAll(async () => {
    vi.stubEnv('DEV_AUTH_ENABLED', '');
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);

    admin = await signInAsAdmin(app, prisma, MARKER);
    const user = await prisma.users.create({
      data: {
        email: `${MARKER}-creator@example.com`,
        creators: {
          create: {
            first_name: MARKER,
            // A contract running today, so the whitelist lets the creator in.
            contracts: {
              create: {
                start_date: new Date(Date.now() - 30 * DAY),
                end_date: new Date(Date.now() + 60 * DAY),
                contract_type: 'regular',
                days_between: 14,
                content_quota: 4,
                fixed_rate: 1_000_000,
              },
            },
          },
        },
      },
      include: { creators: true },
    });
    creator = await signIn(app, {
      userId: user.id,
      role: 'creator',
      creatorId: user.creators!.id,
    });
  });

  afterAll(async () => {
    await prisma.contracts.deleteMany({ where: { creators: { first_name: MARKER } } });
    await prisma.creators.deleteMany({ where: { first_name: MARKER } });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARKER } } });
    await app.close();
    vi.unstubAllEnvs();
  });

  it.each([3, 6, 12])(
    'answers ?range=%i with every month of the range in each chart and both ranges per KPI',
    async (months) => {
      const response = await as(app, admin).get(`/admin/dashboard?range=${months}`);

      expect(response.status).toBe(200);
      expect(response.body.charts.map((chart: { key: string }) => chart.key)).toEqual([
        'spending',
        'views',
        'timeliness',
      ]);
      for (const chart of response.body.charts) expect(chart.months).toHaveLength(months);
      expect(response.body.kpis).toHaveLength(6);
      for (const card of response.body.kpis) expect(card).toHaveProperty('previous');
      expect(typeof response.body.missingViewLinks).toBe('number');
    },
  );

  it('reads six months when no range is asked for', async () => {
    const response = await as(app, admin).get('/admin/dashboard');

    expect(response.status).toBe(200);
    expect(response.body.charts[0].months).toHaveLength(6);
  });

  it.each(['7', '06', 'abc'])('refuses ?range=%s with a 400', async (range) => {
    const response = await as(app, admin).get(`/admin/dashboard?range=${range}`);

    expect(response.status).toBe(400);
  });

  it('refuses a creator the executive dashboard', async () => {
    const response = await as(app, creator).get('/admin/dashboard');

    expect(response.status).toBe(403);
  });

  it('refuses a signed-out visitor', async () => {
    const response = await request(app.getHttpServer())
      .get('/admin/dashboard')
      .set('Origin', process.env.FRONTEND_URL ?? 'http://localhost:3000')
      .set('Sec-Fetch-Site', 'same-origin');

    expect(response.status).toBe(401);
  });

  it("gives a creator their own dashboard cards: nothing sent yet of this period's quota", async () => {
    const response = await as(app, creator).get('/me/dashboard');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ sent: 0, paymentsHref: '/creator/payments' });
    expect(response.body.period).not.toBeNull();
  });
});
