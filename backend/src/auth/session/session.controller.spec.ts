import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Response } from 'express';
import request from 'supertest';
import { AppSessionService } from './session.service.js';
import { SessionController } from './session.controller.js';
import type { Principal } from '../google/ports.js';

describe('SessionController', () => {
  afterEach(() => vi.unstubAllEnvs());

  async function setup() {
    const service = {
      cookieName: vi.fn(() => '__Host-tofly_session'),
      logout: vi.fn().mockResolvedValue(undefined),
      authenticate: vi
        .fn<(_id: unknown, response: Response) => Promise<Principal | null>>()
        .mockImplementation((_id, response) => {
          response.cookie('__Host-tofly_session', 'opaque-id', {
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
        .set('Cookie', '__Host-tofly_session=session-value');

      expect(result.status).toBe(204);
      expect(service.logout).toHaveBeenCalledWith('session-value', expect.anything());
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
        .set('Cookie', '__Host-tofly_session=session-value');

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
        .set('Cookie', '__Host-tofly_session=opaque-id');

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
        .set('Cookie', '__Host-tofly_session=expired');

      expect(result.status).toBe(401);
    } finally {
      await app.close();
    }
  });
});
