import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

// Exercises the endpoints against a real database. Migrations are applied by CI, but the seed
// is a local-development convenience and is not, so this inserts what it needs and removes it
// again — the suite has to pass on an empty database and leave one behind.
describe('Creators (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const emails = ['e2e-aktif@example.com', 'e2e-selesai@example.com'];

  function day(offset: number): Date {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() + offset);
    return date;
  }

  async function seed() {
    await prisma.user.create({
      data: {
        email: emails[0],
        creator: {
          create: {
            firstName: 'Aktif',
            lastName: 'Sekali',
            socialAccounts: {
              create: { platform: 'instagram', username: 'aktif.sekali', isConnected: true },
            },
            contracts: {
              create: {
                startDate: day(-60),
                endDate: day(60),
                daysBetween: 14,
                contentQuota: 3,
                fixedRate: 500000,
                contents: {
                  create: [
                    {
                      name: 'E2E Konten Terkirim',
                      type: 'evergreen',
                      deadline: day(-30),
                      status: 'link_submitted',
                      videoLink: 'https://example.com/reel',
                      videoSubmittedAt: day(-31),
                    },
                    { name: 'E2E Konten Berjalan', type: 'evergreen', deadline: day(30) },
                  ],
                },
              },
            },
          },
        },
      },
    });

    await prisma.user.create({
      data: {
        email: emails[1],
        creator: {
          create: {
            firstName: 'Selesai',
            lastName: 'Kontraknya',
            contracts: {
              create: {
                startDate: day(-200),
                endDate: day(-20),
                daysBetween: 14,
                contentQuota: 1,
                fixedRate: 450000,
                contents: {
                  create: [{ name: 'E2E Konten Telat', type: 'evergreen', deadline: day(-120) }],
                },
              },
            },
          },
        },
      },
    });
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await seed();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  it('lists creators with their contract and performance', async () => {
    const response = await request(app.getHttpServer()).get('/creators').expect(200);

    const aktif = response.body.items.find(
      (item: { email: string }) => item.email === emails[0],
    );

    expect(aktif).toMatchObject({
      name: 'Aktif Sekali',
      socials: { instagram: 'aktif.sekali' },
      contract: { status: 'active', periodNumber: 1, contentQuota: 3 },
      progress: { submitted: 1, total: 2, percent: 50 },
      performance: { onTimeRate: 100, productivity: 'good' },
    });
  });

  it('finds a creator by name', async () => {
    const response = await request(app.getHttpServer())
      .get('/creators')
      .query({ q: 'Aktif Sekali' })
      .expect(200);

    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].email).toBe(emails[0]);
  });

  it('filters down to expired contracts', async () => {
    const response = await request(app.getHttpServer())
      .get('/creators')
      .query({ contract: 'expired' })
      .expect(200);

    const emailsReturned = response.body.items.map((item: { email: string }) => item.email);
    expect(emailsReturned).toContain(emails[1]);
    expect(emailsReturned).not.toContain(emails[0]);
  });

  it('answers a search with no matches with an empty page and the roster counts intact', async () => {
    const response = await request(app.getHttpServer())
      .get('/creators')
      .query({ q: 'creator yang tidak ada' })
      .expect(200);

    expect(response.body.items).toEqual([]);
    expect(response.body.total).toBe(0);
    expect(response.body.stats.total).toBeGreaterThan(0);
  });

  it('pages the result', async () => {
    const response = await request(app.getHttpServer())
      .get('/creators')
      .query({ pageSize: 1 })
      .expect(200);

    expect(response.body.items).toHaveLength(1);
    expect(response.body.pageSize).toBe(1);
    expect(response.body.totalPages).toBe(response.body.total);
  });

  it('rejects a filter value it does not recognise', async () => {
    await request(app.getHttpServer()).get('/creators').query({ contract: 'bogus' }).expect(400);
  });

  it('rejects a parameter it was never asked to accept', async () => {
    await request(app.getHttpServer()).get('/creators').query({ isAdmin: 'true' }).expect(400);
  });

  it('describes one creator in full', async () => {
    const list = await request(app.getHttpServer()).get('/creators').query({ q: 'Aktif' });
    const id = list.body.items[0].id;

    const response = await request(app.getHttpServer()).get(`/creators/${id}`).expect(200);

    expect(response.body.contractHistory).toHaveLength(1);
    expect(response.body.contents).toHaveLength(2);
    expect(response.body.contents[0]).toMatchObject({ outcome: 'on_time' });
  });

  it('never exposes the tokens stored with a social account', async () => {
    const response = await request(app.getHttpServer()).get('/creators').expect(200);

    expect(JSON.stringify(response.body)).not.toMatch(/access_?token/i);
  });

  it('refuses a malformed id before it reaches the database', async () => {
    await request(app.getHttpServer()).get('/creators/not-a-uuid').expect(400);
  });

  it('reports an unknown creator as not found', async () => {
    await request(app.getHttpServer())
      .get('/creators/11111111-1111-4111-8111-111111111111')
      .expect(404)
      .expect((response) => {
        expect(response.body.code).toBe('CREATOR_NOT_FOUND');
      });
  });
});
