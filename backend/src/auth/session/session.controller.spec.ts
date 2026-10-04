import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Response } from 'express';
import request from 'supertest';
import { ACCESS_CHECK } from './access-check.js';
import { AppSessionService } from './session.service.js';
import { SessionController } from './session.controller.js';
import type { Principal } from '../google/ports.js';

describe('SessionController', () => {
  afterEach(() => vi.unstubAllEnvs());

  async function setup() {
    const service = {
      cookieName: vi.fn(() => '__session'),
      logout: vi.fn().mockResolvedValue(undefined),
      authenticate: vi
        .fn<(_id: unknown, response: Response) => Promise<Principal | null>>()
        .mockImplementation((_id, response) => {
          response.cookie('__session', 'opaque-id', {
            httpOnly: true,
            secure: true,
            sameSite: 'lax',
            path: '/',
            maxAge: 1800000,
          });
          return Promise.resolve({
            userId: 'user-1',
            role: 'creator',
            creatorId: 'creator-1',
          });
        }),
    };
    const module = await Test.createTestingModule({
      controllers: [SessionController],
      providers: [{ provide: AppSessionService, useValue: service }],
    }).compile();
    const app = module.createNestApplication();
    app.use(cookieParser());
    await app.init();
    return { app, service };
  }

  it('revokes the cookie session and responds with no content', async () => {
    vi.stubEnv('FRONTEND_URL', 'http://localhost:3000');
    const { app, service } = await setup();
    try {
      const result = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Origin', 'http://localhost:3000')
        .set('Sec-Fetch-Site', 'same-origin')
        .set('Cookie', '__session=session-value');

      expect(result.status).toBe(204);
      expect(service.logout).toHaveBeenCalledWith(
        'session-value',
        expect.anything(),
      );
    } finally {
      await app.close();
    }
  });

  it('rejects cross-origin logout without revoking another session', async () => {
    vi.stubEnv('FRONTEND_URL', 'https://tofly.example');
    const { app, service } = await setup();
    try {
      const result = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Origin', 'https://attacker.example')
        .set('Sec-Fetch-Site', 'cross-site')
        .set('Cookie', '__session=session-value');

      expect(result.status).toBe(403);
      expect(service.logout).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('renews a valid session cookie for same-origin active use', async () => {
    vi.stubEnv('FRONTEND_URL', 'http://localhost:3000');
    const { app, service } = await setup();
    try {
      const result = await request(app.getHttpServer())
        .post('/auth/session/activity')
        .set('Origin', 'http://localhost:3000')
        .set('Sec-Fetch-Site', 'same-origin')
        .set('Cookie', '__session=opaque-id');

      expect(result.status).toBe(204);
      expect(service.authenticate).toHaveBeenCalledWith(
        'opaque-id',
        expect.objectContaining({ cookie: expect.any(Function) }),
      );
      expect(result.headers['set-cookie'][0]).toContain('Max-Age=1800');
    } finally {
      await app.close();
    }
  });

  it('does not answer an activity request as authenticated without a live session', async () => {
    vi.stubEnv('FRONTEND_URL', 'http://localhost:3000');
    const { app, service } = await setup();
    vi.mocked(service.authenticate).mockResolvedValue(null);
    try {
      const result = await request(app.getHttpServer())
        .post('/auth/session/activity')
        .set('Origin', 'http://localhost:3000')
        .set('Sec-Fetch-Site', 'same-origin')
        .set('Cookie', '__session=expired');

      expect(result.status).toBe(401);
    } finally {
      await app.close();
    }
  });
});

// The frontend asks who is signed in before it renders an admin or creator page, so it can send
// a signed-out visitor to /login and tell a signed-in one they have no access, without data.
describe('GET /auth/session', () => {
  const ADMIN: Principal = { userId: 'user-admin', role: 'admin' };
  const CREATOR: Principal = {
    userId: 'user-creator',
    role: 'creator',
    creatorId: 'creator-1',
  };

  async function setup(session: Principal | null, current: Principal | null) {
    const sessions = {
      cookieName: vi.fn(() => '__session'),
      logout: vi.fn(),
      authenticate: vi.fn().mockResolvedValue(session),
    };
    const access = { resolveUser: vi.fn().mockResolvedValue(current) };
    const module = await Test.createTestingModule({
      controllers: [SessionController],
      providers: [
        { provide: AppSessionService, useValue: sessions },
        { provide: ACCESS_CHECK, useValue: access },
      ],
    }).compile();
    const app = module.createNestApplication();
    app.use(cookieParser());
    await app.init();
    return { app, sessions, access };
  }

  it.each([
    ['an admin', ADMIN, 'admin'],
    ['a creator', CREATOR, 'creator'],
  ])(
    'answers the role of %s the whitelist still admits',
    async (_label, principal, role) => {
      const { app, sessions, access } = await setup(principal, principal);
      try {
        const response = await request(app.getHttpServer())
          .get('/auth/session')
          .set('Cookie', '__session=opaque-id');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ role });
        expect(response.headers['cache-control']).toBe('no-store');
        expect(sessions.authenticate).toHaveBeenCalledWith(
          'opaque-id',
          expect.anything(),
        );
        expect(access.resolveUser).toHaveBeenCalledWith(principal.userId);
      } finally {
        await app.close();
      }
    },
  );

  it.each([
    ['no live session', null, null],
    ['a user the whitelist no longer admits', ADMIN, null],
    ['a user whose role changed', ADMIN, CREATOR],
    [
      'a creator whose profile changed',
      CREATOR,
      { ...CREATOR, creatorId: 'creator-2' },
    ],
  ])('answers 401 for %s', async (_label, session, current) => {
    const { app } = await setup(session, current);
    try {
      const response = await request(app.getHttpServer())
        .get('/auth/session')
        .set('Cookie', '__session=opaque-id');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ code: 'UNAUTHENTICATED' });
    } finally {
      await app.close();
    }
  });
});
