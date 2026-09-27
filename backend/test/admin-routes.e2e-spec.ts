import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { as, signIn, signInAsAdmin } from './sessions.js';

const MARKER = 'e2e-admin-routes';
const UUID = '00000000-0000-4000-8000-000000000000';

// Every admin route: the Creator Database, content scheduling and draft review.
const ADMIN_ROUTES = [
  ['get', '/creators'],
  ['get', `/creators/${UUID}`],
  ['post', '/creators'],
  ['post', '/contents'],
  ['get', '/submissions?status=review'],
  ['get', `/submissions/${UUID}`],
  ['patch', `/submissions/${UUID}/approve`],
  ['patch', `/submissions/${UUID}/revise`],
] as const;

describe('admin routes (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let creator: string;
  let adminId: string;

  beforeAll(async () => {
    vi.stubEnv('DEV_AUTH_ENABLED', '');
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);

    admin = await signInAsAdmin(app, prisma, MARKER);
    adminId = (
      await prisma.users.findUniqueOrThrow({
        where: { email: `${MARKER}-signed-in-admin@example.com` },
      })
    ).id;
    const user = await prisma.users.create({
      data: {
        email: `${MARKER}-creator@example.com`,
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
    await prisma.creators.deleteMany({ where: { first_name: MARKER } });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARKER } } });
    await app.close();
    vi.unstubAllEnvs();
  });

  it.each(ADMIN_ROUTES)(
    '%s %s answers 401 without a session',
    async (method, url) => {
      const response = await request(app.getHttpServer())[method](url);

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ code: 'UNAUTHENTICATED' });
    },
  );

  it.each(ADMIN_ROUTES)(
    '%s %s answers 403 to a creator',
    async (method, url) => {
      const response = await as(app, creator)[method](url);

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ code: 'FORBIDDEN' });
    },
  );

  it('opens the Creator Database to a signed-in admin', async () => {
    const response = await as(app, admin).get('/creators');

    expect(response.status).toBe(200);
  });

  it('refuses an admin session once the account is no longer an admin', async () => {
    const session = await signIn(app, { userId: adminId, role: 'admin' });
    await prisma.users.update({
      where: { id: adminId },
      data: { is_admin: false },
    });
    try {
      expect((await as(app, session).get('/creators')).status).toBe(401);
    } finally {
      await prisma.users.update({
        where: { id: adminId },
        data: { is_admin: true },
      });
    }
  });
});
