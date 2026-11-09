import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EmailVerifyModule } from './email-verify.module.js';
import { LOGIN_CODE_STORE } from './login-code-store.js';
import { PrismaLoginCodeStore } from './prisma-login-code-store.js';

const ORIGIN = 'http://localhost:3000';

describe('EmailVerifyModule', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('reads codes from Postgres (AC 7-10)', async () => {
    const module = await Test.createTestingModule({
      imports: [EmailVerifyModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    expect(module.get(LOGIN_CODE_STORE)).toBeInstanceOf(PrismaLoginCodeStore);
  });

  it('serves the route and fails closed when the database cannot answer', async () => {
    vi.stubEnv('FRONTEND_URL', ORIGIN);
    const module = await Test.createTestingModule({
      imports: [EmailVerifyModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    const app = module.createNestApplication();
    await app.init();
    try {
      const result = await request(app.getHttpServer())
        .post('/auth/email/verify')
        .set('Origin', ORIGIN)
        .send({ email: 'a@example.com', code: '123456' })
        .expect(503);

      expect(result.body).toEqual({ code: 'SIGN_IN_FAILED' });
      expect(result.headers['set-cookie']).toBeUndefined();
    } finally {
      await app.close();
    }
  });
});
