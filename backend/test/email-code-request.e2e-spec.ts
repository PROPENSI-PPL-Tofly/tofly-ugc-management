import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { hashLoginCode } from '../src/auth/email/login-code-hash.js';
import {
  SIGN_IN_CODE_MAILER,
  type SignInCodeMailer,
} from '../src/auth/email/sign-in-code-mailer.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const MARKER = 'e2e-email-code-request';
const ORIGIN = 'http://localhost:3000';
const SECRET = 'an-e2e-login-code-secret-of-32-chars!';
const CREATOR = `${MARKER}-creator@example.com`;
const ADMIN = `${MARKER}-admin@example.com`;
const REVOKED = `${MARKER}-revoked@example.com`;
const UNKNOWN = `${MARKER}-unknown@example.com`;

/** POST /auth/email/request through the real app and PostgreSQL (PBI-39, SCRUM-240). */
describe('POST /auth/email/request (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const sent: { to: string; code: string }[] = [];
  const mailer: SignInCodeMailer = {
    sendSignInCode: (to, code) => {
      sent.push({ to, code });
      return Promise.resolve();
    },
  };

  async function whitelistCreator(email: string, revokedOn: Date | null) {
    const user = await prisma.users.create({ data: { email } });
    await prisma.creators.create({
      data: {
        user_id: user.id,
        first_name: 'E2E',
        access_revoke_date: revokedOn,
      },
    });
  }

  beforeAll(async () => {
    vi.stubEnv('FRONTEND_URL', ORIGIN);
    vi.stubEnv('LOGIN_CODE_SECRET', SECRET);
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SIGN_IN_CODE_MAILER)
      .useValue(mailer)
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    await whitelistCreator(CREATOR, null);
    await whitelistCreator(REVOKED, new Date('2026-01-01'));
    await prisma.users.create({ data: { email: ADMIN, is_admin: true } });
  });

  afterEach(async () => {
    sent.length = 0;
    await prisma.login_codes.deleteMany({
      where: { email: { startsWith: MARKER } },
    });
  });

  afterAll(async () => {
    const where = { email: { startsWith: MARKER } };
    await prisma.creators.deleteMany({ where: { users: where } });
    await prisma.users.deleteMany({ where });
    await app.close();
    vi.unstubAllEnvs();
  });

  function ask(email: string) {
    return request(app.getHttpServer())
      .post('/auth/email/request')
      .set('Origin', ORIGIN)
      .send({ email });
  }

  function rows(email: string) {
    return prisma.login_codes.findMany({
      where: { email },
      orderBy: { createdAt: 'asc' },
    });
  }

  it.each([
    ['creator', CREATOR],
    ['admin', ADMIN],
  ])(
    'emails a %s a six-digit code and stores only its HMAC, for 10 minutes',
    async (_role, email) => {
      const response = await ask(email.toUpperCase()).expect(200);

      expect(response.body).toEqual({ resendAfterSeconds: 60 });
      expect(sent).toHaveLength(1);
      expect(sent[0]).toEqual({ to: email, code: expect.stringMatching(/^\d{6}$/) });
      const [row] = await rows(email);
      expect(row.codeHash).toBe(hashLoginCode(email, sent[0].code, SECRET));
      expect(row.codeHash).not.toContain(sent[0].code);
      expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBe(600_000);
    },
  );

  it.each([
    ['an unknown email', UNKNOWN],
    ['a revoked creator', REVOKED],
  ])(
    'answers %s exactly as a whitelisted one, sends nothing and keeps a decoy row',
    async (_label, email) => {
      const whitelisted = await ask(CREATOR).expect(200);
      sent.length = 0;

      const response = await ask(email).expect(200);

      expect(response.body).toEqual(whitelisted.body);
      expect(sent).toEqual([]);
      const [row] = await rows(email);
      expect(row.codeHash).toMatch(/^[0-9a-f]{64}$/);
    },
  );

  it('ends the earlier code when a new one is requested', async () => {
    await ask(CREATOR).expect(200);
    await ask(CREATOR).expect(200);

    const [first, second] = await rows(CREATOR);
    expect(first.expiresAt.getTime()).toBeLessThanOrEqual(
      second.createdAt.getTime(),
    );
    expect(second.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it.each([
    ['a whitelisted', CREATOR],
    ['an unknown', UNKNOWN],
  ])(
    'refuses %s email its sixth code in an hour with the minutes to wait',
    async (_label, email) => {
      for (let i = 0; i < 5; i += 1) await ask(email).expect(200);

      const response = await ask(email).expect(429);

      expect(response.body).toEqual({
        code: 'TOO_MANY_REQUESTS',
        minutesToWait: 60,
      });
      expect(response.headers['retry-after']).toBe('3600');
      expect(await rows(email)).toHaveLength(5);
    },
  );

  it('lets exactly five of ten simultaneous requests through, so the limit holds under a race', async () => {
    const answers = await Promise.all(
      Array.from({ length: 10 }, () => ask(UNKNOWN)),
    );

    const statuses = answers.map(({ status }) => status).sort();
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429, 429, 429, 429, 429]);
    expect(await rows(UNKNOWN)).toHaveLength(5);
  });

  it('counts each email apart', async () => {
    for (let i = 0; i < 5; i += 1) await ask(UNKNOWN).expect(200);

    await ask(CREATOR).expect(200);
  });
});
