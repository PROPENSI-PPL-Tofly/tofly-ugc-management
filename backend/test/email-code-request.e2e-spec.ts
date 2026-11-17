import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { hashLoginCode } from '../src/auth/email/login-code-hash.js';
import {
  EMAIL_SENDER,
  type EmailMessage,
  type EmailSender,
} from '../src/email/email-sender.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// POST /auth/email/request through the whole app and a real database (PBI-39, SCRUM-240). Only the
// outgoing email is faked: 39.1 owns the SMTP adapter, and a test must never send real mail.

const ORIGIN = 'http://localhost:3000';
const SECRET = 'e2e-login-code-secret-of-at-least-32-chars';
const GENERIC = { message: 'Kalau email kamu terdaftar, kode sudah dikirim.' };
const run = `${randomUUID().slice(0, 8)}`;
const CREATOR = `e2e-creator-${run}@example.com`;
const ADMIN = `e2e-admin-${run}@example.com`;
const REVOKED = `e2e-revoked-${run}@example.com`;
const UNKNOWN = `e2e-unknown-${run}@example.com`;

/** A fake sender: keeps every message instead of delivering it, and can be told to fail. */
class OutboxSender implements EmailSender {
  readonly sent: EmailMessage[] = [];
  failNext = false;

  send(message: EmailMessage): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      return Promise.reject(new Error('SMTP unavailable'));
    }
    this.sent.push(message);
    return Promise.resolve();
  }

  codeSentTo(email: string): string | undefined {
    const message = this.sent.filter((m) => m.to === email).at(-1);
    return message && /\d{6}/.exec(message.text)?.[0];
  }
}

describe('POST /auth/email/request (e2e)', () => {
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

    const yesterday = new Date(Date.now() - 2 * 86_400_000);
    for (const [email, isAdmin, revokedOn] of [
      [CREATOR, false, null],
      [ADMIN, true, null],
      [REVOKED, false, yesterday],
    ] as const) {
      const user = await prisma.users.create({
        data: { email, is_admin: isAdmin },
      });
      userIds.push(user.id);
      if (!isAdmin) {
        await prisma.creators.create({
          data: {
            user_id: user.id,
            first_name: 'E2E',
            access_revoke_date: revokedOn,
          },
        });
      }
    }
  });

  afterAll(async () => {
    await prisma.login_codes.deleteMany({
      where: { email: { in: [CREATOR, ADMIN, REVOKED, UNKNOWN] } },
    });
    await prisma.login_code_requests.deleteMany({
      where: { email: { in: [CREATOR, ADMIN, REVOKED, UNKNOWN] } },
    });
    await prisma.creators.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.users.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
    vi.unstubAllEnvs();
  });

  beforeEach(async () => {
    outbox.sent.length = 0;
    await prisma.login_codes.deleteMany({
      where: { email: { in: [CREATOR, ADMIN, REVOKED, UNKNOWN] } },
    });
    await prisma.login_code_requests.deleteMany({
      where: { email: { in: [CREATOR, ADMIN, REVOKED, UNKNOWN] } },
    });
  });

  function post(email: string) {
    return request(app.getHttpServer())
      .post('/auth/email/request')
      .set('Origin', ORIGIN)
      .send({ email });
  }

  function rowsOf(email: string) {
    return prisma.login_codes.findMany({
      where: { email },
      orderBy: { created_at: 'desc' },
    });
  }

  it.each([
    ['a whitelisted creator', CREATOR],
    ['an admin', ADMIN],
  ])('emails %s a code stored only as its HMAC', async (_, email) => {
    const result = await post(email).expect(200);

    expect(result.body).toEqual(GENERIC);
    const code = outbox.codeSentTo(email);
    expect(code).toMatch(/^\d{6}$/);
    const [row] = await rowsOf(email);
    expect(row.code_hash).toBe(hashLoginCode(email, code!, SECRET));
    expect(row.expires_at.getTime() - row.created_at.getTime()).toBe(600_000);
    expect(row.attempts).toBe(0);
    expect(row.used_at).toBeNull();
  });

  it.each([
    ['an unregistered email', UNKNOWN],
    ['a revoked creator', REVOKED],
  ])(
    'answers %s exactly as a registered one, storing a decoy and sending nothing',
    async (_, email) => {
      const result = await post(email).expect(200);

      expect(result.body).toEqual(GENERIC);
      expect(outbox.sent).toEqual([]);
      const rows = await rowsOf(email);
      expect(rows).toHaveLength(1);
      expect(rows[0].code_hash).toMatch(/^[0-9a-f]{64}$/);
    },
  );

  it('normalizes the email before the lookup and the row', async () => {
    await post(`  ${CREATOR.toUpperCase()} `).expect(200);

    expect(outbox.sent.map((message) => message.to)).toEqual([CREATOR]);
    expect(await rowsOf(CREATOR)).toHaveLength(1);
  });

  it('replaces the earlier code with the newest one', async () => {
    await post(CREATOR).expect(200);
    const first = outbox.codeSentTo(CREATOR)!;
    await post(CREATOR).expect(200);
    const second = outbox.codeSentTo(CREATOR)!;

    const [newest] = await rowsOf(CREATOR);
    expect(newest.code_hash).toBe(hashLoginCode(CREATOR, second, SECRET));
    expect(newest.code_hash).not.toBe(hashLoginCode(CREATOR, first, SECRET));
  });

  it('keeps the earlier code the newest when the new one cannot be sent', async () => {
    await post(CREATOR).expect(200);
    const sent = outbox.codeSentTo(CREATOR)!;
    outbox.failNext = true;

    const result = await post(CREATOR).expect(503);

    expect(result.body).toEqual({
      code: 'CODE_NOT_SENT',
      message: 'Kode gagal dikirim. Coba lagi.',
    });
    const rows = await rowsOf(CREATOR);
    expect(rows).toHaveLength(1);
    expect(rows[0].code_hash).toBe(hashLoginCode(CREATOR, sent, SECRET));
  });

  it('counts a failed send towards the hourly limit, while its code row is removed', async () => {
    await post(CREATOR).expect(200);
    outbox.failNext = true;
    await post(CREATOR).expect(503);
    for (let i = 0; i < 3; i += 1) await post(CREATOR).expect(200);

    await post(CREATOR).expect(429);

    expect(await rowsOf(CREATOR)).toHaveLength(4);
    expect(
      await prisma.login_code_requests.count({ where: { email: CREATOR } }),
    ).toBe(5);
  });

  it.each([
    ['a registered email', CREATOR],
    ['an unregistered email', UNKNOWN],
  ])('refuses the sixth request in an hour from %s', async (_, email) => {
    for (let i = 0; i < 5; i += 1) await post(email).expect(200);

    const result = await post(email).expect(429);

    expect(result.body).toEqual({
      code: 'TOO_MANY_REQUESTS',
      message: 'Terlalu banyak permintaan. Coba lagi dalam 60 menit.',
      retryAfterMinutes: 60,
    });
    expect(await rowsOf(email)).toHaveLength(5);
  });

  it('lets no more than five of ten simultaneous requests through', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => post(UNKNOWN)),
    );

    expect(results.filter((r) => r.status === 200)).toHaveLength(5);
    expect(results.filter((r) => r.status === 429)).toHaveLength(5);
    expect(await rowsOf(UNKNOWN)).toHaveLength(5);
  });
});
