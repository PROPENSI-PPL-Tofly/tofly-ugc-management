import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Every email created here starts with this marker so the cleanup never touches anything
// else in the database, seeded or not.
const MARKER = 'e2e-create';

/** YYYY-MM-DD for `offset` days from today (UTC), as the date picker sends it. */
function iso(offset: number): string {
  const now = new Date();
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + offset,
    ),
  )
    .toISOString()
    .slice(0, 10);
}

/** DDMMYYYY of a YYYY-MM-DD day, as Evergreen titles spell it. */
function ddmmyyyy(day: string): string {
  const [year, month, date] = day.split('-');
  return `${date}${month}${year}`;
}

// Starts tomorrow, so the first slot the 5-day buffer allows is 6 days from today.
function body(email: string, overrides: Record<string, unknown> = {}) {
  return {
    name: 'Salsa Putri Amelia',
    email,
    socialPlatform: 'instagram',
    socialUsername: 'salsa.amelia',
    contractType: 'regular',
    contractStart: iso(1),
    contractEnd: iso(60),
    interval: 7,
    quota: 2,
    fixedRate: 500000,
    deadlines: [iso(13), iso(6)],
    ...overrides,
  };
}

describe('POST /creators (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  // creators.user_id is ON DELETE RESTRICT, so creators go first; their social accounts,
  // contracts and contents cascade with them.
  afterAll(async () => {
    await prisma.creators.deleteMany({
      where: { users: { email: { startsWith: MARKER } } },
    });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARKER } } });
    await app.close();
  });

  it('whitelists the email and saves the creator, contract and titled schedule', async () => {
    const email = `${MARKER}-salsa@example.com`;

    const { body: created } = await request(app.getHttpServer())
      .post('/creators')
      .send(body(email))
      .expect(201);

    const saved = await prisma.creators.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        users: true,
        social_accounts: true,
        contracts: { include: { contents: { orderBy: { deadline: 'asc' } } } },
      },
    });

    expect(saved).toMatchObject({
      first_name: 'Salsa',
      middle_name: 'Putri',
      last_name: 'Amelia',
      users: { email, is_admin: false },
      social_accounts: [{ platform: 'instagram', username: 'salsa.amelia' }],
    });
    expect(saved.contracts).toHaveLength(1);
    expect(saved.contracts[0]).toMatchObject({
      days_between: 7,
      content_quota: 2,
    });
    expect(Number(saved.contracts[0].fixed_rate)).toBe(500000);
    expect(
      saved.contracts[0].contents.map(({ name, type, status }) => ({
        name,
        type,
        status,
      })),
    ).toEqual([
      {
        name: `Evg_1_Salsa Putri Amelia_${ddmmyyyy(iso(6))}`,
        type: 'evergreen',
        status: 'scheduled',
      },
      {
        name: `Evg_2_Salsa Putri Amelia_${ddmmyyyy(iso(13))}`,
        type: 'evergreen',
        status: 'scheduled',
      },
    ]);
  });

  it('shows the new creator in the Creator Database listing', async () => {
    const email = `${MARKER}-listed@example.com`;
    await request(app.getHttpServer())
      .post('/creators')
      .send(body(email))
      .expect(201);

    const { body: listing } = await request(app.getHttpServer())
      .get('/creators')
      .query({ q: email })
      .expect(200);

    expect(listing.items).toHaveLength(1);
    expect(listing.items[0]).toMatchObject({
      email,
      contract: { status: 'upcoming', contentQuota: 2 },
    });
  });

  it('answers an invalid body with 422 and a message per field, saving nothing', async () => {
    const email = `${MARKER}-invalid@example.com`;

    const { body: rejected } = await request(app.getHttpServer())
      .post('/creators')
      .send(body(email, { contractStart: iso(-1), quota: 0 }))
      .expect(422);

    expect(rejected).toEqual({
      message: 'Data creator tidak valid',
      errors: {
        contractStart: 'Tanggal mulai tidak boleh sebelum hari ini',
        quota: 'Jumlah konten harus lebih dari 0',
      },
    });
    await expect(prisma.users.count({ where: { email } })).resolves.toBe(0);
  });

  it('answers an email already on the whitelist with 422 on the email field', async () => {
    const email = `${MARKER}-twice@example.com`;
    await request(app.getHttpServer())
      .post('/creators')
      .send(body(email))
      .expect(201);

    // users.email is citext, so a different case is the same login.
    const { body: rejected } = await request(app.getHttpServer())
      .post('/creators')
      .send(body(email.toUpperCase()))
      .expect(422);

    expect(rejected.errors).toEqual({ email: 'Email sudah terdaftar' });
    await expect(
      prisma.creators.count({ where: { users: { email } } }),
    ).resolves.toBe(1);
  });

  it('never makes the new login an admin, whatever the body says', async () => {
    const email = `${MARKER}-admin@example.com`;

    await request(app.getHttpServer())
      .post('/creators')
      .send({ ...body(email), is_admin: true, isAdmin: true })
      .expect(201);

    await expect(
      prisma.users.findUniqueOrThrow({ where: { email } }),
    ).resolves.toMatchObject({ is_admin: false });
  });
});
