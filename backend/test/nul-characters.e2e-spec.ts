import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { day } from './days.js';
import { as, signIn, signInAsAdmin } from './sessions.js';

// Regression for the ZAP API scan finding in docs/security/tofly-security-assessment.md: a JSON
// text field carrying a NUL character (\u0000) reached PostgreSQL, which cannot store it, and the
// request ended in a 500. Through the real app, with real sessions, it is now a 400 and nothing
// is written (OWASP A10:2025 Mishandling of Exceptional Conditions).

const MARKER = 'e2e-nul-characters';

describe('NUL characters in request bodies (e2e, security assessment)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: ReturnType<typeof as>;
  let creator: ReturnType<typeof as>;
  let contractId: string;

  const refused = {
    code: 'INVALID_CHARACTERS',
    message: 'Teks berisi karakter yang tidak diizinkan',
  };

  beforeAll(async () => {
    vi.stubEnv('DEV_AUTH_ENABLED', '');
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);

    admin = as(app, await signInAsAdmin(app, prisma, MARKER));
    const user = await prisma.users.create({
      data: {
        email: `${MARKER}-creator@example.com`,
        creators: {
          create: {
            first_name: MARKER,
            contracts: {
              create: {
                start_date: day(-30),
                end_date: day(30),
                contract_type: 'regular',
                days_between: 14,
                content_quota: 2,
                fixed_rate: 1_000_000,
              },
            },
          },
        },
      },
      include: { creators: { include: { contracts: true } } },
    });
    contractId = user.creators!.contracts[0].id;
    creator = as(
      app,
      await signIn(app, {
        userId: user.id,
        role: 'creator',
        creatorId: user.creators!.id,
      }),
    );
  });

  afterAll(async () => {
    await prisma.creators.deleteMany({ where: { first_name: MARKER } });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARKER } } });
    await app.close();
    vi.unstubAllEnvs();
  });

  const storedComments = () =>
    prisma.invoice_comments.count({
      where: { invoices: { contract_id: contractId } },
    });

  it("answers 400, not 500, to an admin's invoice comment holding a NUL character, and stores nothing", async () => {
    const before = await storedComments();

    const response = await admin
      .post(`/invoices/${contractId}/comments`)
      .send({ text: 'halo\u0000' });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject(refused);
    expect(await storedComments()).toBe(before);
  });

  it('answers 400 to a manual adjustment whose reason holds a NUL character', async () => {
    const response = await admin
      .post(`/invoices/${contractId}/adjustments`)
      .send({ amount: 1000, reason: 'koreksi\u0000' });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject(refused);
  });

  it("answers 400 to a creator's own invoice comment holding a NUL character", async () => {
    const response = await creator
      .post(`/me/invoices/${contractId}/comments`)
      .send({ text: '\u0000' });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject(refused);
  });

  it('still saves the same comment without the NUL character', async () => {
    await admin
      .post(`/invoices/${contractId}/comments`)
      .send({ text: 'halo' })
      .expect(201);
  });

  // The check never replaces authentication: a signed-out request is still refused as one.
  it('still answers 401 to a signed-out request, whatever its body holds', async () => {
    const response = await request(app.getHttpServer())
      .post(`/invoices/${contractId}/comments`)
      .set('Origin', process.env.FRONTEND_URL ?? 'http://localhost:3000')
      .set('Sec-Fetch-Site', 'same-origin')
      .send({ text: 'halo\u0000' });

    expect(response.status).toBe(401);
  });
});
