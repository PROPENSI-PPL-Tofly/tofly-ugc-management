import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import {
  EMAIL_SENDER,
  type EmailMessage,
  type EmailSender,
} from '../src/email/email-sender.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Signing in with an email code end to end against real Postgres (PBI-39): the code the request
// emails is the one verification accepts, once, and wrong guesses are counted atomically.

const ORIGIN = 'http://localhost:3000';
const SECRET = 'e2e-login-code-secret-of-at-least-32-chars';
const run = randomUUID().slice(0, 8);
const CREATOR = `e2e-sign-in-creator-${run}@example.com`;
const ADMIN = `e2e-sign-in-admin-${run}@example.com`;
const EMAILS = [CREATOR, ADMIN];

class OutboxSender implements EmailSender {
  readonly sent: EmailMessage[] = [];

  send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }

  codeSentTo(email: string): string {
    const message = this.sent.filter((m) => m.to === email).at(-1);
    const code = message && /\d{6}/.exec(message.text)?.[0];
    if (!code) throw new Error(`no code sent to ${email}`);
    return code;
  }
}

/** A six-digit code that is not the one sent. */
function otherThan(code: string): string {
  return String((Number(code) + 1) % 1_000_000).padStart(6, '0');
}

describe('Email code sign-in (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const outbox = new OutboxSender();
  const userIds: string[] = [];

  beforeAll(async () => {
    vi.stubEnv('FRONTEND_URL', ORIGIN);
    vi.stubEnv('LOGIN_CODE_SECRET', SECRET);
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EMAIL_SENDER)
      .useValue(outbox)
      .compile();
    app = module.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    for (const [email, isAdmin] of [
      [CREATOR, false],
      [ADMIN, true],
    ] as const) {
      const user = await prisma.users.create({
        data: { email, is_admin: isAdmin },
      });
      userIds.push(user.id);
      if (!isAdmin) {
        await prisma.creators.create({
          data: { user_id: user.id, first_name: 'E2E' },
        });
      }
    }
  });

  afterAll(async () => {
    await prisma.app_sessions.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.login_codes.deleteMany({ where: { email: { in: EMAILS } } });
    await prisma.login_code_requests.deleteMany({
      where: { email: { in: EMAILS } },
    });
    await prisma.creators.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.users.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
    vi.unstubAllEnvs();
  });

  beforeEach(async () => {
    outbox.sent.length = 0;
    await prisma.login_codes.deleteMany({ where: { email: { in: EMAILS } } });
    await prisma.login_code_requests.deleteMany({
      where: { email: { in: EMAILS } },
    });
  });

  async function codeFor(email: string): Promise<string> {
    await request(app.getHttpServer())
      .post('/auth/email/request')
      .set('Origin', ORIGIN)
      .send({ email })
      .expect(200);
    return outbox.codeSentTo(email);
  }

  function verify(email: string, code: string) {
    return request(app.getHttpServer())
      .post('/auth/email/verify')
      .set('Origin', ORIGIN)
      .send({ email, code });
  }

  function sessionId(setCookie: string[] | string | undefined): string {
    const header = [setCookie ?? []].flat().find((c) => c.startsWith('__session='));
    if (!header) throw new Error('no session cookie');
    return header.slice('__session='.length).split(';')[0];
  }

  it.each([
    ['a creator', CREATOR, 'creator', '/creator/dashboard'],
    ['an admin', ADMIN, 'admin', '/admin/creators'],
  ])(
    'signs %s in with the emailed code and opens their home page (AC 3, 10)',
    async (_, email, role, home) => {
      const code = await codeFor(email);

      const result = await verify(email, code).expect(200);

      expect(result.body).toEqual({ redirectTo: home });
      const id = sessionId(result.headers['set-cookie']);
      const session = await prisma.app_sessions.findUnique({
        where: { idHash: createHash('sha256').update(id).digest('hex') },
      });
      expect(session?.role).toBe(role);
    },
  );

  it('accepts a code only once (AC 3)', async () => {
    const code = await codeFor(CREATOR);
    await verify(CREATOR, code).expect(200);

    const again = await verify(CREATOR, code).expect(410);

    expect(again.body).toEqual({ code: 'CODE_EXPIRED' });
  });

  it('counts down wrong guesses and kills the code at the fifth (AC 7, 8)', async () => {
    const code = await codeFor(CREATOR);
    const wrong = otherThan(code);

    for (const left of [4, 3, 2, 1]) {
      const result = await verify(CREATOR, wrong).expect(422);
      expect(result.body).toEqual({ code: 'CODE_WRONG', attemptsLeft: left });
    }
    await verify(CREATOR, wrong).expect(410);

    await verify(CREATOR, code).expect(410);
  });

  it('never lets simultaneous wrong guesses go past five attempts', async () => {
    const code = await codeFor(CREATOR);

    await Promise.all(
      Array.from({ length: 12 }, () => verify(CREATOR, otherThan(code))),
    );

    const [row] = await prisma.login_codes.findMany({
      where: { email: CREATOR },
    });
    expect(row.attempts).toBe(5);
    await verify(CREATOR, code).expect(410);
  });

  it('starts exactly one session when the same code is sent twice at once', async () => {
    const code = await codeFor(CREATOR);

    const results = await Promise.all([
      verify(CREATOR, code),
      verify(CREATOR, code),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 410]);
  });

  it('stops the earlier code counting once a new one is sent (AC 4)', async () => {
    const first = await codeFor(CREATOR);
    const second = await codeFor(CREATOR);

    if (first !== second) await verify(CREATOR, first).expect(422);
    await verify(CREATOR, second).expect(200);
  });

  it('answers an expired code with CODE_EXPIRED (AC 9)', async () => {
    const code = await codeFor(CREATOR);
    await prisma.login_codes.updateMany({
      where: { email: CREATOR },
      data: {
        created_at: new Date(Date.now() - 20 * 60_000),
        expires_at: new Date(Date.now() - 10 * 60_000),
      },
    });

    const result = await verify(CREATOR, code).expect(410);

    expect(result.body).toEqual({ code: 'CODE_EXPIRED' });
  });
});
