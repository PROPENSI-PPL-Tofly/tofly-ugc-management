import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Rows created here carry this marker so the cleanup never touches anything else in the
// database, seeded or not.
const MARKER = 'e2e-creators';

function day(offset: number): Date {
  const date = new Date();
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + offset,
    ),
  );
}

describe('GET /creators (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const aulia = await prisma.users.create({
      data: { email: `${MARKER}-aulia@example.com` },
    });
    const budi = await prisma.users.create({
      data: { email: `${MARKER}-budi@example.com` },
    });
    const citra = await prisma.users.create({
      data: { email: `${MARKER}-citra@example.com` },
    });

    await prisma.creators.create({
      data: {
        user_id: aulia.id,
        first_name: `${MARKER} Aulia`,
        last_name: 'Rahma',
        social_accounts: {
          create: { platform: 'instagram', username: 'aulia.rahma' },
        },
        contracts: {
          create: {
            start_date: day(-30),
            end_date: day(30),
            contract_type: 'regular',
            days_between: 14,
            content_quota: 2,
            fixed_rate: 100000,
            contents: {
              create: [
                {
                  name: 'On time',
                  type: 'evergreen',
                  deadline: day(-10),
                  status: 'link_submitted',
                  video_link: 'https://example.com/on-time',
                  video_submitted_at: day(-11),
                },
                { name: 'Open', type: 'specific', deadline: day(10) },
              ],
            },
          },
        },
      },
    });
    await prisma.creators.create({
      data: {
        user_id: budi.id,
        first_name: `${MARKER} Budi`,
        last_name: 'Santoso',
      },
    });
    await prisma.creators.create({
      data: {
        user_id: citra.id,
        first_name: `${MARKER} Citra`,
        last_name: 'Lestari',
      },
    });
  });

  afterAll(async () => {
    await prisma.creators.deleteMany({
      where: { first_name: { startsWith: MARKER } },
    });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARKER } } });
    await app.close();
  });

  it('lists creators with their contract, progress and performance', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/creators')
      .query({ pageSize: 50 })
      .expect(200);

    expect(body).toMatchObject({ page: 1, pageSize: 50, totalPages: 1 });
    expect(body.total).toBeGreaterThanOrEqual(3);

    const aulia = body.items.find(
      (item: { email: string }) => item.email === `${MARKER}-aulia@example.com`,
    );
    expect(aulia).toMatchObject({
      name: `${MARKER} Aulia Rahma`,
      socials: { instagram: 'aulia.rahma' },
      accessRevokeDate: null,
      contract: {
        status: 'active',
        daysRemaining: 30,
        periodNumber: 1,
        contentQuota: 2,
      },
      progress: { submitted: 1, total: 2, percent: 50 },
      performance: {
        onTimeRate: 100,
        avgRevisions: 0,
        productivity: 'good',
        productivityLabel: 'Baik',
      },
    });

    const budi = body.items.find(
      (item: { email: string }) => item.email === `${MARKER}-budi@example.com`,
    );
    expect(budi.contract).toMatchObject({
      status: 'none',
      startDate: null,
      daysRemaining: null,
    });
  });

  it('orders by name and pages through the roster', async () => {
    const all = await request(app.getHttpServer())
      .get('/creators?pageSize=50')
      .expect(200);
    const ours = all.body.items
      .map((item: { name: string }) => item.name)
      .filter((name: string) => name.startsWith(MARKER));
    expect(ours).toEqual([
      `${MARKER} Aulia Rahma`,
      `${MARKER} Budi Santoso`,
      `${MARKER} Citra Lestari`,
    ]);

    const second = await request(app.getHttpServer())
      .get('/creators?page=2&pageSize=1')
      .expect(200);
    expect(second.body).toMatchObject({
      page: 2,
      pageSize: 1,
      total: all.body.total,
    });
    expect(second.body.items).toHaveLength(1);
    expect(second.body.items[0].id).toBe(all.body.items[1].id);
  });

  it('defaults to the first page of ten', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/creators')
      .expect(200);
    expect(body).toMatchObject({ page: 1, pageSize: 10 });
    expect(body.items.length).toBeLessThanOrEqual(10);
  });

  it('rejects paging values that are not positive integers', async () => {
    await request(app.getHttpServer()).get('/creators?page=abc').expect(400);
    await request(app.getHttpServer()).get('/creators?page=0').expect(400);
    await request(app.getHttpServer()).get('/creators?pageSize=51').expect(400);
    await request(app.getHttpServer())
      .get('/creators?pageSize=1.5')
      .expect(400);
  });

  it('searches by name across the whole roster, not just the current page', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/creators')
      .query({ q: `${MARKER} Aulia`, pageSize: 50 })
      .expect(200);

    expect(body.items.map((item: { name: string }) => item.name)).toEqual([
      `${MARKER} Aulia Rahma`,
    ]);
  });

  it('filters by contract status', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/creators')
      .query({ q: MARKER, contractStatus: 'none', pageSize: 50 })
      .expect(200);

    const names = body.items.map((item: { name: string }) => item.name);
    expect(names).toEqual(
      expect.arrayContaining([
        `${MARKER} Budi Santoso`,
        `${MARKER} Citra Lestari`,
      ]),
    );
    expect(names).not.toContain(`${MARKER} Aulia Rahma`);
  });

  it('filters by productivity band', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/creators')
      .query({ q: MARKER, productivity: 'good', pageSize: 50 })
      .expect(200);

    expect(body.items.map((item: { name: string }) => item.name)).toEqual([
      `${MARKER} Aulia Rahma`,
    ]);
  });

  it('rejects filter values outside what the metrics module produces', async () => {
    await request(app.getHttpServer())
      .get('/creators?contractStatus=cancelled')
      .expect(400);
    await request(app.getHttpServer())
      .get('/creators?productivity=excellent')
      .expect(400);
    await request(app.getHttpServer())
      .get(`/creators?q=${'a'.repeat(101)}`)
      .expect(400);
  });
});
