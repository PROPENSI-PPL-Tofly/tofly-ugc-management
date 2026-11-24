import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { as, signIn } from './sessions.js';

// SCRUM-296 (PBI-23) over HTTP against the real app and schema: who may read "Log Aktivitas", what
// a response carries, and what the routes refuse. audit_logs rows can never be deleted, so the one
// row this suite adds is "Sistem"'s (it adds no actor to the filter options) about a creator id no
// one has (it adds no creator), and every assertion on it filters by that id.

const MARKER = 'e2e-audit-logs-api';
const email = (name: string) => `${MARKER}-${name}@example.com`;
const ROUTES = ['/audit-logs', '/audit-logs/filter-options'];

describe('Log Aktivitas API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let superAdmin: string;
  let admin: string;
  let creator: string;

  async function cleanUp() {
    await prisma.creators.deleteMany({
      where: { users: { email: { startsWith: MARKER } } },
    });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARKER } } });
  }

  async function adminSession(
    name: string,
    role: 'admin' | 'super_admin',
  ): Promise<{ id: string; cookie: string }> {
    const user = await prisma.users.create({
      data: { email: email(name), is_admin: true, admin_role: role },
    });
    return {
      id: user.id,
      cookie: await signIn(app, { userId: user.id, role: 'admin' }),
    };
  }

  beforeAll(async () => {
    vi.stubEnv('DEV_AUTH_ENABLED', '');
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    await cleanUp();

    ({ cookie: superAdmin } = await adminSession('super-admin', 'super_admin'));
    ({ cookie: admin } = await adminSession('admin', 'admin'));
    const user = await prisma.users.create({
      data: {
        email: email('creator'),
        creators: { create: { first_name: MARKER } },
      },
      include: { creators: true },
    });
    creator = await signIn(app, {
      userId: user.id,
      role: 'creator',
      creatorId: user.creators!.id,
    });
  });

  afterAll(async () => {
    await cleanUp();
    await app.close();
    vi.unstubAllEnvs();
  });

  // OWASP A01:2025 Broken Access Control: the audit trail is for Super Admins only.
  describe('access', () => {
    it.each(ROUTES)('answers 401 to %s without a session', async (url) => {
      const response = await request(app.getHttpServer()).get(url);

      expect(response.status).toBe(401);
    });

    it.each(ROUTES)('answers 403 to an Admin on %s', async (url) => {
      const response = await as(app, admin).get(url);

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ code: 'FORBIDDEN' });
    });

    it.each(ROUTES)('answers 403 to a creator on %s', async (url) => {
      expect((await as(app, creator).get(url)).status).toBe(403);
    });

    it.each(ROUTES)('opens %s to a Super Admin', async (url) => {
      expect((await as(app, superAdmin).get(url)).status).toBe(200);
    });

    it('refuses a Super Admin on the next request once made an Admin', async () => {
      const demoted = await adminSession('demoted', 'super_admin');
      expect((await as(app, demoted.cookie).get('/audit-logs')).status).toBe(
        200,
      );

      await prisma.users.update({
        where: { id: demoted.id },
        data: { admin_role: 'admin' },
      });

      expect((await as(app, demoted.cookie).get('/audit-logs')).status).toBe(
        403,
      );
    });
  });

  // OWASP A02:2025 Security Misconfiguration: no cache keeps the trail.
  it.each(ROUTES)('tells every cache not to keep %s', async (url) => {
    const response = await as(app, superAdmin).get(url);

    expect(response.headers['cache-control']).toBe('no-store');
  });

  // OWASP A05:2025 Injection, A10:2025: refused before the query, never read as "no filter".
  it.each([
    '/audit-logs?category=pengaturan%27%20OR%20%271%27%3D%271',
    '/audit-logs?creator=not-an-id',
    '/audit-logs?from=2026-11-03&to=2026-11-01',
    '/audit-logs?page=0',
  ])('answers 400 to %s', async (url) => {
    expect((await as(app, superAdmin).get(url)).status).toBe(400);
  });

  // OWASP A06:2025, A09:2025: the trail can be read here and changed nowhere.
  it.each(['post', 'put', 'patch', 'delete'] as const)(
    'has no %s route for the log',
    async (method) => {
      expect((await as(app, superAdmin)[method]('/audit-logs')).status).toBe(
        404,
      );
    },
  );

  // OWASP A09:2025: a row written past AuditLogger still shows no credential, and the stored actor
  // is answered as stored.
  it('answers a stored entry in SCRUM-297 shape without its credentials', async () => {
    const creatorId = randomUUID();
    await prisma.audit_logs.create({
      data: {
        actor_name: 'Sistem',
        actor_role: 'system',
        category: 'invoice_pembayaran',
        action: 'payment_confirmed',
        target_type: 'invoice',
        target_label: MARKER,
        creator_id: creatorId,
        old_values: { status: 'payment_uploaded', token: 'leaked' },
        new_values: { status: 'paid', session_id: 'leaked', statusCode: 200 },
      },
    });

    const response = await as(app, superAdmin).get(
      `/audit-logs?creator=${creatorId}&actor=system&category=invoice_pembayaran`,
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    expect(response.body.items).toEqual([
      expect.objectContaining({
        actor: { name: 'Sistem', role: 'system' },
        action: 'payment_confirmed',
        targetLabel: MARKER,
        // No creator has this id.
        creator: null,
        oldValues: { status: 'payment_uploaded' },
        newValues: { status: 'paid', statusCode: 200 },
      }),
    ]);
  });
});
