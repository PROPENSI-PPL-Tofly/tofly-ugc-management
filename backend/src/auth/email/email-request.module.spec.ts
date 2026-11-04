import { Test } from '@nestjs/testing';
import request from 'supertest';
import { EMAIL_SENDER, unreadyEmailSender } from '../../email/email-sender.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EmailRequestModule } from './email-request.module.js';
import { LOGIN_CODE_ISSUER } from './login-code-issuer.js';
import { PrismaLoginCodeIssuer } from './prisma-login-code-issuer.js';

const ORIGIN = 'http://localhost:3000';

async function start() {
  const module = await Test.createTestingModule({
    imports: [EmailRequestModule],
  })
    .overrideProvider(PrismaService)
    .useValue({})
    .compile();
  const app = module.createNestApplication();
  await app.init();
  return { module, app };
}

describe('EmailRequestModule', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('stores codes in Postgres and sends nothing until 39.1 binds a real sender', async () => {
    const { module, app } = await start();
    try {
      expect(module.get(LOGIN_CODE_ISSUER)).toBeInstanceOf(
        PrismaLoginCodeIssuer,
      );
      expect(module.get(EMAIL_SENDER)).toBe(unreadyEmailSender);
    } finally {
      await app.close();
    }
  });

  it('serves the route and fails closed when nothing behind it works', async () => {
    vi.stubEnv('FRONTEND_URL', ORIGIN);
    const { app } = await start();
    try {
      const result = await request(app.getHttpServer())
        .post('/auth/email/request')
        .set('Origin', ORIGIN)
        .send({ email: 'a@example.com' })
        .expect(503);

      expect(result.body).toEqual({
        code: 'CODE_NOT_SENT',
        message: 'Kode gagal dikirim. Coba lagi.',
      });
    } finally {
      await app.close();
    }
  });
});
