import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Response } from 'express';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import {
  SESSION_STARTER,
  type SessionStarter,
} from '../src/auth/google/ports.js';
import { PrismaWhitelistResolver } from '../src/auth/google/prisma-whitelist-resolver.js';
import {
  EMAIL_SENDER,
  type EmailMessage,
  type EmailSender,
} from '../src/email/email-sender.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { as, signIn } from './sessions.js';

// SCRUM-246 (PBI-23) against the real schema: "Pengguna Admin" for Super Admins only, adding an
// Admin who can sign in at once, "Email sudah dipakai" for any user's address, rename and
// reactivate with their Log Aktivitas entries, and the last sign-in (OWASP A01, A09:2025). A role
// change, a new Super Admin and a deactivation wait for the code emailed to the Super Admin, and
// end the target's sessions (OWASP A01, A07:2025). Only the outgoing email is faked.

/** Keeps what the app sends instead of sending it. */
class OutboxSender implements EmailSender {
  readonly sent: EmailMessage[] = [];

  send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }

  /** The six digits of the last code sent to `to`. */
  lastCode(to: string): string {
    const message = this.sent.filter((sent) => sent.to === to).at(-1);
    const code = /: (\d{6})/.exec(message?.text ?? '')?.[1];
    if (!code) throw new Error(`no code was sent to ${to}`);
    return code;
  }
}

const MARKER = 'e2e-admin-users';
const email = (name: string) => `${MARKER}-${name}@example.com`;

describe('/admin-users (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let superCookie: string;
  let superId: string;
  const outbox = new OutboxSender();

  /** Asks for a code by email for this session and enters it, as the confirmation modal does. */
  async function confirm(cookie: string, to: string) {
    await as(app, cookie).post('/admin-users/confirmation').expect(200);
    await as(app, cookie)
      .post('/admin-users/confirmation/verify')
      .send({ code: outbox.lastCode(to) })
      .expect(200);
  }

  async function cleanUp() {
    await prisma.creators.deleteMany({
      where: { users: { email: { startsWith: MARKER } } },
    });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARKER } } });
  }

  async function makeUser(name: string, data: object = {}) {
    return prisma.users.create({
      data: { email: email(name), is_admin: true, ...data },
    });
  }

  beforeAll(async () => {
    vi.stubEnv('DEV_AUTH_ENABLED', '');
    vi.stubEnv('SUPER_ADMIN_EMAIL', '');
    vi.stubEnv('LOGIN_CODE_SECRET', 'e2e-login-code-secret-of-at-least-32-chars');
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EMAIL_SENDER)
      .useValue(outbox)
      .compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    await cleanUp();
    const actor = await makeUser('super', {
      admin_role: 'super_admin',
      name: 'Super Gunta',
    });
    superId = actor.id;
    superCookie = await signIn(app, { userId: actor.id, role: 'admin' });
  });

  afterAll(async () => {
    await cleanUp();
    await app.close();
    vi.unstubAllEnvs();
  });

  describe('access', () => {
    it('answers 403 to an Admin and to a creator, and 401 with no session', async () => {
      const admin = await makeUser('plain-admin');
      const adminCookie = await signIn(app, { userId: admin.id, role: 'admin' });
      const user = await prisma.users.create({
        data: { email: email('creator') },
      });
      const creator = await prisma.creators.create({
        data: { user_id: user.id, first_name: 'Kreator' },
      });
      const creatorCookie = await signIn(app, {
        userId: user.id,
        role: 'creator',
        creatorId: creator.id,
      });

      await as(app, adminCookie).get('/admin-users').expect(403);
      const refused = await as(app, creatorCookie).get('/admin-users').expect(403);
      expect(refused.body.message).toBe('Halaman ini hanya untuk Super Admin');
      await request(app.getHttpServer()).get('/admin-users').expect(401);
      await as(app, adminCookie)
        .post('/admin-users')
        .send({ name: 'X', email: email('by-admin'), role: 'admin' })
        .expect(403);
    });
  });

  describe('Tambah Admin', () => {
    it('adds an Admin who can sign in at once, and records it in Log Aktivitas', async () => {
      const response = await as(app, superCookie)
        .post('/admin-users')
        .send({ name: ' Sinta Dewi ', email: email('Sinta').toUpperCase(), role: 'admin' })
        .expect(201);

      expect(response.body).toMatchObject({
        name: 'Sinta Dewi',
        email: email('sinta'),
        role: 'admin',
        status: 'active',
        lastSignedInAt: null,
        isSelf: false,
      });
      await expect(
        new PrismaWhitelistResolver(prisma).resolve(email('sinta')),
      ).resolves.toEqual({
        userId: response.body.id,
        role: 'admin',
        adminRole: 'admin',
      });
      const [entry] = await prisma.audit_logs.findMany({
        where: { target_id: response.body.id, action: 'admin_added' },
      });
      expect(entry).toMatchObject({
        actor_user_id: superId,
        actor_name: 'Super Gunta',
        actor_role: 'super_admin',
        category: 'akses_admin',
        target_label: 'Sinta Dewi',
        new_values: { name: 'Sinta Dewi', email: email('sinta'), role: 'admin' },
      });
    });

    // Any user: a creator's address, written in other capitals, is the same address (citext).
    it("refuses a creator's email with \"Email sudah dipakai\"", async () => {
      const user = await prisma.users.create({
        data: { email: email('kreator-taken') },
      });
      await prisma.creators.create({
        data: { user_id: user.id, first_name: 'Kreator' },
      });

      const response = await as(app, superCookie)
        .post('/admin-users')
        .send({ name: 'Kreator', email: email('Kreator-Taken'), role: 'admin' })
        .expect(422);

      expect(response.body.errors).toEqual({ email: 'Email sudah dipakai' });
      await expect(
        prisma.users.findUniqueOrThrow({ where: { email: email('kreator-taken') } }),
      ).resolves.toMatchObject({ is_admin: false, admin_role: null });
    });

    it('names every wrong field', async () => {
      const response = await as(app, superCookie)
        .post('/admin-users')
        .send({ name: 'n'.repeat(101), email: 'not-an-email', role: 'owner' })
        .expect(422);

      expect(response.body.errors).toEqual({
        name: 'Nama maksimal 100 karakter',
        email: 'Format email tidak valid',
        role: 'Role wajib dipilih',
      });
    });
  });

  describe('the list', () => {
    it('lists Admins only, active first, then by name, with the team counts', async () => {
      await makeUser('list-b', { name: `${MARKER} Bima` });
      await makeUser('list-a', { name: `${MARKER} Ayu`, is_active: false });
      await makeUser('list-c', { name: `${MARKER} Cahya` });

      const response = await as(app, superCookie)
        .get(`/admin-users?q=${MARKER}-list-`)
        .expect(200);

      expect(response.body.items.map((item: { name: string }) => item.name)).toEqual([
        `${MARKER} Bima`,
        `${MARKER} Cahya`,
        `${MARKER} Ayu`,
      ]);
      expect(response.body).toMatchObject({ page: 1, pageSize: 10, total: 3 });
      expect(response.body.inactiveCount).toBeGreaterThanOrEqual(1);
    });

    it('searches the email too, ignoring case, and marks the Super Admin\'s own row', async () => {
      const response = await as(app, superCookie)
        .get(`/admin-users?q=${encodeURIComponent(email('SUPER'))}`)
        .expect(200);

      expect(response.body.items).toEqual([
        expect.objectContaining({ id: superId, role: 'super_admin', isSelf: true }),
      ]);
    });

    // A search for "_" or "%" is that character, not a wildcard that matches every Admin.
    it.each(['_', '%'])('reads %s in the search as itself', async (character) => {
      const response = await as(app, superCookie)
        .get(`/admin-users?q=${encodeURIComponent(`${MARKER}${character}`)}`)
        .expect(200);

      expect(response.body.total).toBe(0);
    });

    it('answers 400 for a page below 1', async () => {
      await as(app, superCookie).get('/admin-users?page=0').expect(400);
    });
  });

  describe('Ubah and Aktifkan', () => {
    it('renames an Admin and records the old and new name', async () => {
      const admin = await makeUser('rename');

      const response = await as(app, superCookie)
        .patch(`/admin-users/${admin.id}`)
        .send({ name: 'Bima Santoso' })
        .expect(200);

      expect(response.body).toMatchObject({ name: 'Bima Santoso' });
      const [entry] = await prisma.audit_logs.findMany({
        where: { target_id: admin.id, action: 'admin_changed' },
      });
      expect(entry).toMatchObject({
        old_values: { name: null },
        new_values: { name: 'Bima Santoso' },
        target_label: 'Bima Santoso',
      });
    });

    it('reactivates a deactivated Admin, who can then sign in', async () => {
      const admin = await makeUser('reactivate', { is_active: false });

      await as(app, superCookie)
        .post(`/admin-users/${admin.id}/reactivate`)
        .expect(200)
        .expect((response) => expect(response.body.status).toBe('active'));

      await expect(
        new PrismaWhitelistResolver(prisma).resolve(email('reactivate')),
      ).resolves.toMatchObject({ role: 'admin' });
      await expect(
        prisma.audit_logs.count({
          where: { target_id: admin.id, action: 'admin_reactivated' },
        }),
      ).resolves.toBe(1);
    });

    it("answers 404 for a creator's id", async () => {
      const user = await prisma.users.create({
        data: { email: email('creator-id') },
      });

      await as(app, superCookie)
        .patch(`/admin-users/${user.id}`)
        .send({ name: 'Bukan Admin' })
        .expect(404);
    });
  });

  describe('Ubah role, Tambah Super Admin and Nonaktifkan, after the email code', () => {
    it('changes a role only after this session enters the emailed code, then ends their sessions', async () => {
      const admin = await makeUser('promote', { name: 'Rina' });
      const adminCookie = await signIn(app, { userId: admin.id, role: 'admin' });

      const refused = await as(app, superCookie)
        .patch(`/admin-users/${admin.id}`)
        .send({ name: 'Rina', role: 'super_admin' })
        .expect(403);
      expect(refused.body.code).toBe('CONFIRMATION_REQUIRED');

      await as(app, superCookie)
        .post('/admin-users/confirmation')
        .expect(200)
        .expect((response) => expect(response.body).toEqual({ validMinutes: 10 }));
      const code = outbox.lastCode(email('super'));
      // OWASP A02: only the HMAC is kept.
      const stored = await prisma.admin_confirmation_codes.findMany({
        where: { user_id: superId },
      });
      expect(JSON.stringify(stored)).not.toContain(code);
      const wrong = code === '000000' ? '111111' : '000000';
      await as(app, superCookie)
        .post('/admin-users/confirmation/verify')
        .send({ code: wrong })
        .expect(422)
        .expect((response) => expect(response.body.code).toBe('CONFIRMATION_WRONG'));
      await as(app, superCookie)
        .post('/admin-users/confirmation/verify')
        .send({ code })
        .expect(200);

      const response = await as(app, superCookie)
        .patch(`/admin-users/${admin.id}`)
        .send({ name: 'Rina', role: 'super_admin' })
        .expect(200);

      expect(response.body).toMatchObject({ role: 'super_admin' });
      // The new role applies on the next sign-in; the open session is gone.
      await as(app, adminCookie).get('/creators').expect(401);
      const [entry] = await prisma.audit_logs.findMany({
        where: { target_id: admin.id, action: 'admin_changed' },
      });
      expect(entry).toMatchObject({
        old_values: { role: 'admin' },
        new_values: { role: 'super_admin' },
      });
      // The used code cannot confirm again.
      await as(app, superCookie)
        .post('/admin-users/confirmation/verify')
        .send({ code })
        .expect(422);
    });

    it('confirms only the session that entered the code', async () => {
      const otherCookie = await signIn(app, { userId: superId, role: 'admin' });
      const admin = await makeUser('other-session');

      await as(app, otherCookie)
        .patch(`/admin-users/${admin.id}`)
        .send({ name: 'Lain', role: 'super_admin' })
        .expect(403);
      await as(app, otherCookie)
        .post('/admin-users')
        .send({ name: 'Super Baru', email: email('new-super'), role: 'super_admin' })
        .expect(403);
      await expect(
        prisma.users.findUnique({ where: { email: email('new-super') } }),
      ).resolves.toBeNull();
    });

    it('deactivates an Admin after the code, ending their open session at once', async () => {
      const admin = await makeUser('deactivate', { name: 'Dodi' });
      const adminCookie = await signIn(app, { userId: admin.id, role: 'admin' });
      await as(app, adminCookie).get('/creators').expect(200);
      const cookie = await signIn(app, { userId: superId, role: 'admin' });
      await confirm(cookie, email('super'));

      await as(app, cookie)
        .post(`/admin-users/${admin.id}/deactivate`)
        .expect(200)
        .expect((response) => expect(response.body.status).toBe('inactive'));

      await as(app, adminCookie).get('/creators').expect(401);
      await expect(
        prisma.app_sessions.count({ where: { userId: admin.id } }),
      ).resolves.toBe(0);
      await expect(
        new PrismaWhitelistResolver(prisma).resolve(email('deactivate')),
      ).resolves.toBeNull();
      const [entry] = await prisma.audit_logs.findMany({
        where: { target_id: admin.id, action: 'admin_deactivated' },
      });
      expect(entry).toMatchObject({
        old_values: { status: 'active' },
        new_values: { status: 'inactive' },
      });
    });

    it('refuses your own deactivation and your own role, even after the code', async () => {
      await as(app, superCookie)
        .post(`/admin-users/${superId}/deactivate`)
        .expect(409)
        .expect((response) => expect(response.body.code).toBe('CANNOT_DEACTIVATE_SELF'));
      const refused = await as(app, superCookie)
        .patch(`/admin-users/${superId}`)
        .send({ name: 'Super Gunta', role: 'admin' })
        .expect(422);
      expect(refused.body.errors).toEqual({
        role: 'Kamu tidak bisa mengubah role akunmu sendiri.',
      });
    });

    // Two Super Admins demoting each other at once: the row locks make the second one see the
    // first one's change, so one active Super Admin is always left.
    it('keeps one active Super Admin when the last two demote each other at once', async () => {
      const first = await makeUser('race-a', { admin_role: 'super_admin' });
      const second = await makeUser('race-b', { admin_role: 'super_admin' });
      const firstCookie = await signIn(app, { userId: first.id, role: 'admin' });
      const secondCookie = await signIn(app, { userId: second.id, role: 'admin' });
      await confirm(firstCookie, email('race-a'));
      await confirm(secondCookie, email('race-b'));
      // Every other Super Admin (this suite's actor and the one promoted above) steps aside.
      const others = await prisma.users.findMany({
        where: {
          admin_role: 'super_admin',
          is_active: true,
          id: { notIn: [first.id, second.id] },
        },
        select: { id: true },
      });
      await prisma.users.updateMany({
        where: { id: { in: others.map((other) => other.id) } },
        data: { is_active: false },
      });
      try {
        const [one, two] = await Promise.all([
          as(app, firstCookie)
            .patch(`/admin-users/${second.id}`)
            .send({ name: 'B', role: 'admin' }),
          as(app, secondCookie)
            .patch(`/admin-users/${first.id}`)
            .send({ name: 'A', role: 'admin' }),
        ]);

        expect([one.status, two.status].filter((status) => status === 200)).toHaveLength(1);
        await expect(
          prisma.users.count({
            where: { id: { in: [first.id, second.id] }, admin_role: 'super_admin' },
          }),
        ).resolves.toBe(1);
      } finally {
        await prisma.users.updateMany({
          where: { id: { in: others.map((other) => other.id) } },
          data: { is_active: true },
        });
      }
    });
  });

  it('records the last sign-in when a session starts', async () => {
    const admin = await makeUser('signs-in');
    const starter = app.get<SessionStarter>(SESSION_STARTER);

    await starter.start(
      { cookie: () => undefined } as unknown as Response,
      { userId: admin.id, role: 'admin' },
    );

    const row = await prisma.users.findUniqueOrThrow({ where: { id: admin.id } });
    expect(row.last_signed_in_at).toBeInstanceOf(Date);
  });
});
