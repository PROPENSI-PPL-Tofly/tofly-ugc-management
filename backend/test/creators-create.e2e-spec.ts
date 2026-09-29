import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { as, signInAsAdmin } from './sessions.js';
import { jakartaMidnight, readableDay } from '../src/creators/evergreen.js';

// Every email created here starts with this marker so the cleanup never touches anything
// else in the database, seeded or not.
const MARKER = 'e2e-create';

/** YYYY-MM-DD for `offset` days from today in Jakarta, as the admin's date picker sends it. */
function iso(offset: number): string {
  const today = jakartaMidnight(new Date());
  return new Date(
    Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate() + offset,
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
  /** Requests signed in as a whitelisted admin. */
  let admin: ReturnType<typeof as>;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    admin = as(app, await signInAsAdmin(app, prisma, MARKER));
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

    const { body: created } = await admin
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
    await admin
      .post('/creators')
      .send(body(email))
      .expect(201);

    const { body: listing } = await admin
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

    const { body: rejected } = await admin
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

  // A contract that ends inside the buffer has no day any content could be due on.
  it('refuses a contract that ends inside the 5-day buffer, saving nothing', async () => {
    const email = `${MARKER}-short@example.com`;

    const { body: rejected } = await admin
      .post('/creators')
      .send(body(email, { contractEnd: iso(3), quota: 1, deadlines: [iso(3)] }))
      .expect(422);

    expect(rejected.errors).toMatchObject({
      contractEnd: `Akhir kontrak paling cepat ${readableDay(iso(6))} (masa buffer 5 hari)`,
    });
    await expect(prisma.users.count({ where: { email } })).resolves.toBe(0);
  });

  it('accepts a contract that ends exactly when the buffer does', async () => {
    const email = `${MARKER}-edge@example.com`;

    await admin
      .post('/creators')
      .send(body(email, { contractEnd: iso(6), quota: 1, deadlines: [iso(6)] }))
      .expect(201);
  });

  it('accepts 100 contents and refuses 101', async () => {
    const hundred = Array.from({ length: 100 }, () => iso(6));
    await admin
      .post('/creators')
      .send(body(`${MARKER}-hundred@example.com`, { quota: 100, deadlines: hundred }))
      .expect(201);

    const email = `${MARKER}-too-many@example.com`;
    const { body: rejected } = await admin
      .post('/creators')
      .send(body(email, { quota: 101, deadlines: [...hundred, iso(6)] }))
      .expect(422);

    expect(rejected.errors).toEqual({ quota: 'Jumlah konten maksimal 100' });
    await expect(prisma.users.count({ where: { email } })).resolves.toBe(0);
  });

  it('answers an email already on the whitelist with 422 on the email field', async () => {
    const email = `${MARKER}-twice@example.com`;
    await admin
      .post('/creators')
      .send(body(email))
      .expect(201);

    // users.email is citext, so a different case is the same login.
    const { body: rejected } = await admin
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

    await admin
      .post('/creators')
      .send({ ...body(email), is_admin: true, isAdmin: true })
      .expect(201);

    await expect(
      prisma.users.findUniqueOrThrow({ where: { email } }),
    ).resolves.toMatchObject({ is_admin: false });
  });
});
