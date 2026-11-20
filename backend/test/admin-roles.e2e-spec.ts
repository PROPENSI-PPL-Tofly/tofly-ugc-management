import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaWhitelistResolver } from '../src/auth/google/prisma-whitelist-resolver.js';
import { SuperAdminBootstrap } from '../src/auth/super-admin/super-admin-bootstrap.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { as, signIn } from './sessions.js';

// SCRUM-245 (PBI-23) against the real schema: the admin_role/is_active columns and their checks,
// a deactivated Admin refused on the next request of a live session, and the first Super Admin
// from SUPER_ADMIN_EMAIL (OWASP A01:2025 Broken Access Control).

const MARKER = 'e2e-admin-roles';
const email = (name: string) => `${MARKER}-${name}@example.com`;

describe('Admin roles and status (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  async function cleanUp() {
    await prisma.users.deleteMany({ where: { email: { startsWith: MARKER } } });
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
  });

  afterAll(async () => {
    await cleanUp();
    await app.close();
    vi.unstubAllEnvs();
  });

  describe('the users table', () => {
    // prisma/ops/seed-admins.sql and the seeds still insert only is_admin.
    it('makes a row inserted with only is_admin an Admin, and a creator nothing', async () => {
      const admin = await prisma.users.create({
        data: { email: email('plain-admin'), is_admin: true },
      });
      const other = await prisma.users.create({
        data: { email: email('plain-user') },
      });

      expect(admin).toMatchObject({ admin_role: 'admin', is_active: true });
      expect(other).toMatchObject({ admin_role: null, is_active: true });
    });

    it('drops the role of a user who stops being an Admin', async () => {
      const user = await prisma.users.create({
        data: {
          email: email('demoted'),
          is_admin: true,
          admin_role: 'super_admin',
        },
      });

      const after = await prisma.users.update({
        where: { id: user.id },
        data: { is_admin: false },
      });

      expect(after.admin_role).toBeNull();
    });

    it('clears a role written onto a user who is not an Admin', async () => {
      await expect(
        prisma.$executeRaw`update users set admin_role = 'admin' where email = ${email('plain-user')}`,
      ).resolves.toBe(1);
      // The trigger clears it again rather than leaving half an Admin.
      const user = await prisma.users.findUniqueOrThrow({
        where: { email: email('plain-user') },
      });
      expect(user.admin_role).toBeNull();
    });

    it.each([
      ['longer than 100 characters', 'a'.repeat(101)],
      ['blank', '   '],
    ])('refuses a name %s', async (_label, name) => {
      await expect(
        prisma.users.create({
          data: { email: email('bad-name'), is_admin: true, name },
        }),
      ).rejects.toThrow(/users_name_length/);
    });

    it('keeps a name of exactly 100 characters', async () => {
      const user = await prisma.users.create({
        data: {
          email: email('long-name'),
          is_admin: true,
          name: 'a'.repeat(100),
        },
      });

      expect(user.name).toHaveLength(100);
    });
  });

  describe('a deactivated Admin', () => {
    it('is refused on the next request of a session that is still open, and let back in once reactivated', async () => {
      const admin = await prisma.users.create({
        data: { email: email('deactivated'), is_admin: true },
      });
      const cookie = await signIn(app, { userId: admin.id, role: 'admin' });

      await as(app, cookie).get('/creators').expect(200);

      await prisma.users.update({
        where: { id: admin.id },
        data: { is_active: false },
      });
      await as(app, cookie).get('/creators').expect(401);

      // The session row was not touched by the refusal above, so reactivating is enough.
      await prisma.users.update({
        where: { id: admin.id },
        data: { is_active: true },
      });
      const again = await signIn(app, { userId: admin.id, role: 'admin' });
      await as(app, again).get('/creators').expect(200);
    });

    it('cannot sign in', async () => {
      await prisma.users.create({
        data: {
          email: email('cannot-sign-in'),
          is_admin: true,
          is_active: false,
        },
      });
      const resolver = new PrismaWhitelistResolver(prisma);

      await expect(
        resolver.resolve(email('cannot-sign-in')),
      ).resolves.toBeNull();
    });

    it('reads as a Super Admin or an Admin on each request', async () => {
      const user = await prisma.users.create({
        data: {
          email: email('role-read'),
          is_admin: true,
          admin_role: 'super_admin',
        },
      });
      const resolver = new PrismaWhitelistResolver(prisma);

      await expect(resolver.resolveUser(user.id)).resolves.toEqual({
        userId: user.id,
        role: 'admin',
        adminRole: 'super_admin',
      });
    });
  });

  describe('the first Super Admin from SUPER_ADMIN_EMAIL', () => {
    beforeEach(async () => {
      // Other suites never make a Super Admin; this one removes its own between cases.
      await prisma.users.deleteMany({
        where: { email: { startsWith: MARKER }, admin_role: 'super_admin' },
      });
    });

    it('adds an unknown address as a Super Admin who can then sign in', async () => {
      const bootstrap = app.get(SuperAdminBootstrap);

      await expect(bootstrap.ensure(email('first-super'))).resolves.toBe(
        'created',
      );

      const resolver = new PrismaWhitelistResolver(prisma);
      await expect(
        resolver.resolve(email('first-super')),
      ).resolves.toMatchObject({
        role: 'admin',
        adminRole: 'super_admin',
      });
    });

    it('does nothing once a Super Admin exists, so roles change only in the app', async () => {
      const bootstrap = app.get(SuperAdminBootstrap);
      await bootstrap.ensure(email('first-super'));

      await expect(bootstrap.ensure(email('second-super'))).resolves.toBe(
        'exists',
      );
      await expect(
        prisma.users.findUnique({ where: { email: email('second-super') } }),
      ).resolves.toBeNull();
    });

    it('promotes an existing Admin, reactivating them', async () => {
      await prisma.users.create({
        data: { email: email('promoted'), is_admin: true, is_active: false },
      });

      await expect(
        app.get(SuperAdminBootstrap).ensure(email('promoted')),
      ).resolves.toBe('promoted');
      await expect(
        prisma.users.findUniqueOrThrow({ where: { email: email('promoted') } }),
      ).resolves.toMatchObject({
        is_admin: true,
        admin_role: 'super_admin',
        is_active: true,
      });
    });

    it("never turns a creator's account into a Super Admin", async () => {
      await prisma.users.create({
        data: {
          email: email('creator'),
          creators: { create: { first_name: MARKER } },
        },
      });

      await expect(
        app.get(SuperAdminBootstrap).ensure(email('creator')),
      ).resolves.toBe('creator');
      await expect(
        prisma.users.findUniqueOrThrow({ where: { email: email('creator') } }),
      ).resolves.toMatchObject({ is_admin: false, admin_role: null });
    });
  });

  it('keeps the health check open while all of this runs', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
  });
});
