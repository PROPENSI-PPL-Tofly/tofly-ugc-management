import { Test } from '@nestjs/testing';
import request from 'supertest';
import { EMAIL_SENDER } from '../../email/email-sender.js';
import { SmtpEmailSender } from '../../email/smtp-email-sender.js';
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

const SMTP_ENV = {
  SMTP_HOST: 'smtp.gmail.com',
  SMTP_PORT: '587',
  SMTP_USER: 'tofly.notify@gmail.com',
  SMTP_PASS: 'sixteen charact',
  EMAIL_FROM: 'tofly.notify@gmail.com',
};

function stubSmtp(values: Partial<Record<keyof typeof SMTP_ENV, string>>) {
  for (const name of Object.keys(SMTP_ENV) as (keyof typeof SMTP_ENV)[]) {
    vi.stubEnv(name, values[name] ?? '');
  }
}

describe('EmailRequestModule', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('stores codes in Postgres and sends them through the configured SMTP account (AC 3)', async () => {
    stubSmtp(SMTP_ENV);
    const { module, app } = await start();
    try {
      expect(module.get(LOGIN_CODE_ISSUER)).toBeInstanceOf(
        PrismaLoginCodeIssuer,
      );
      expect(module.get(EMAIL_SENDER)).toBeInstanceOf(SmtpEmailSender);
    } finally {
      await app.close();
    }
  });

  it('serves the route and fails closed when no SMTP account is configured (AC 6)', async () => {
    stubSmtp({});
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
