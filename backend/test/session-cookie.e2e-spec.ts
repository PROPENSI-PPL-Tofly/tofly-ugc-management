import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Response } from 'express';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AppSessionService } from '../src/auth/session/session.service.js';
import { jakartaDay } from '../src/creators/evergreen.js';
import type { Principal } from '../src/auth/google/ports.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const MARKER = 'e2e-session-cookie';

describe('application session cookie (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sessions: AppSessionService;
  let principal: Principal;
  let cookieName: string;
  let sessionId: string;

  beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DEV_AUTH_ENABLED', '');
    vi.stubEnv('FRONTEND_URL', 'http://localhost:3000');
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    sessions = app.get(AppSessionService);

    const user = await prisma.users.create({
      data: {
        email: `${MARKER}@example.com`,
        creators: { create: { first_name: MARKER } },
      },
      include: { creators: true },
    });
    principal = {
      userId: user.id,
      role: 'creator',
      creatorId: user.creators!.id,
    };
    const response = { cookie: vi.fn() } as unknown as Response & {
      cookie: ReturnType<typeof vi.fn>;
    };
    ({ id: sessionId } = await sessions.start(response, principal));
    cookieName = sessions.cookieName();
  });

  afterAll(async () => {
    await prisma.creators.deleteMany({ where: { first_name: MARKER } });
    await prisma.users.deleteMany({
      where: { email: `${MARKER}@example.com` },
    });
    await app.close();
    vi.unstubAllEnvs();
  });

  function taskList(cookie?: string) {
    const call = request(app.getHttpServer()).get('/me/contents');
    return cookie ? call.set('Cookie', cookie) : call;
  }

  it('uses the cookie to authenticate a protected creator request', async () => {
    const response = await taskList(`${cookieName}=${sessionId}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ items: [], total: 0 });
    expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(response.headers['set-cookie'][0]).toContain('Secure');
    expect(response.headers['set-cookie'][0]).toContain('SameSite=Lax');
  });

  it.each([
    ['missing', () => undefined],
    ['malformed', () => `${cookieName}=malformed`],
  ])(
    'rejects a %s session cookie',
    async (_case, cookie) => {
      const response = await taskList(cookie());
      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ code: 'UNAUTHENTICATED' });
    },
  );

  // PRD 3.1: the session persists until sign-out or until access is revoked.
  it('refuses a live session on the request after the creator access is revoked', async () => {
    const creatorId = principal.role === 'creator' ? principal.creatorId : '';
    const { id } = await sessions.start(
      { cookie: vi.fn() } as unknown as Response,
      principal,
    );
    expect((await taskList(`${cookieName}=${id}`)).status).toBe(200);

    await prisma.creators.update({
      where: { id: creatorId },
      data: { access_revoke_date: new Date(`${jakartaDay(new Date())}Z`) },
    });
    try {
      expect((await taskList(`${cookieName}=${id}`)).status).toBe(401);
    } finally {
      await prisma.creators.update({
        where: { id: creatorId },
        data: { access_revoke_date: null },
      });
    }
  });

  it('revokes the server session at logout and refuses its old cookie', async () => {
    const logout = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Origin', 'http://localhost:3000')
      .set('Sec-Fetch-Site', 'same-origin')
      .set('Cookie', `${cookieName}=${sessionId}`);

    expect(logout.status).toBe(204);
    expect(logout.headers['set-cookie'][0]).toContain(`${cookieName}=`);
    expect(logout.headers['set-cookie'][0]).toContain('HttpOnly');

    const oldCookie = await taskList(`${cookieName}=${sessionId}`);
    expect(oldCookie.status).toBe(401);
  });
});
