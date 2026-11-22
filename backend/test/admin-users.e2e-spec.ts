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
import { PrismaService } from '../src/prisma/prisma.service.js';
import { as, signIn } from './sessions.js';

// SCRUM-246 (PBI-23) against the real schema: "Pengguna Admin" for Super Admins only, adding an
// Admin who can sign in at once, "Email sudah dipakai" for any user's address, rename and
// reactivate with their Log Aktivitas entries, and the last sign-in (OWASP A01, A09:2025).

const MARKER = 'e2e-admin-users';
const email = (name: string) => `${MARKER}-${name}@example.com`;

describe('/admin-users (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let superCookie: string;
  let superId: string;

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
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
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

    it('refuses a name over two lines, and stores nothing', async () => {
      const response = await as(app, superCookie)
        .post('/admin-users')
        .send({ name: 'Sinta\nDewi', email: email('two-lines'), role: 'admin' })
        .expect(422);

      expect(response.body.errors).toEqual({
        name: 'Nama berisi karakter yang tidak diizinkan',
      });
      await expect(
        prisma.users.findUnique({ where: { email: email('two-lines') } }),
      ).resolves.toBeNull();
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

    // Both answered 500 in the #230 review: PostgreSQL cannot hold NUL, and 1e20 is no skip.
    it('answers 400 for a NUL character in the search', async () => {
      const response = await as(app, superCookie)
        .get('/admin-users?q=a%00b')
        .expect(400);

      expect(response.body).toMatchObject({ code: 'INVALID_CHARACTERS' });
    });

    it('answers 400 for a page no list could reach', async () => {
      await as(app, superCookie)
        .get('/admin-users?page=99999999999999999999')
        .expect(400);
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
