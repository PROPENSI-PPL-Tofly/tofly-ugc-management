import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EmailCodeRequestModule } from './email-code-request.module.js';
import { LOGIN_CODE_ISSUER } from './login-code-issuer.js';
import { PrismaLoginCodeIssuer } from './prisma-login-code-issuer.js';
import {
  SIGN_IN_CODE_MAILER,
  unreadySignInCodeMailer,
} from './sign-in-code-mailer.js';

const ORIGIN = 'http://localhost:3000';
const CREATOR = 'creator@example.com';

/** Just enough of PrismaService: one whitelisted creator and a login_codes that records rows. */
function fakePrisma() {
  const stored: { email: string; codeHash: string }[] = [];
  const tx = {
    $executeRaw: () => Promise.resolve(1),
    login_codes: {
      findMany: () => Promise.resolve([]),
      updateMany: () => Promise.resolve({ count: 0 }),
      create: ({ data }: { data: { email: string; codeHash: string } }) => {
        stored.push(data);
        return Promise.resolve(data);
      },
    },
  };
  return {
    stored,
    users: {
      findUnique: ({ where }: { where: { email?: string } }) =>
        Promise.resolve(
          where.email === CREATOR
            ? {
                id: 'user-1',
                is_admin: false,
                creators: { id: 'creator-1', access_revoke_date: null },
              }
            : null,
        ),
    },
    $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx),
  };
}

describe('EmailCodeRequestModule', () => {
  afterEach(() => vi.unstubAllEnvs());

  async function boot() {
    vi.stubEnv('FRONTEND_URL', ORIGIN);
    vi.stubEnv('LOGIN_CODE_SECRET', 'x'.repeat(32));
    const prisma = fakePrisma();
    const module = await Test.createTestingModule({
      imports: [EmailCodeRequestModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    const app = module.createNestApplication();
    await app.init();
    const post = (email: string) =>
      request(app.getHttpServer())
        .post('/auth/email/request')
        .set('Origin', ORIGIN)
        .send({ email });
    return { app, module, prisma, post };
  }

  it('binds login_codes through Prisma and the mailer placeholder until SCRUM-239', async () => {
    const { app, module } = await boot();
    try {
      expect(module.get(LOGIN_CODE_ISSUER)).toBeInstanceOf(
        PrismaLoginCodeIssuer,
      );
      expect(module.get(SIGN_IN_CODE_MAILER)).toBe(unreadySignInCodeMailer);
    } finally {
      await app.close();
    }
  });

  it('stores a decoy for an unknown email and answers 200', async () => {
    const { app, prisma, post } = await boot();
    try {
      await post('nobody@example.com').expect(200);

      expect(prisma.stored).toHaveLength(1);
      expect(prisma.stored[0].email).toBe('nobody@example.com');
    } finally {
      await app.close();
    }
  });

  it('stores the hash for a whitelisted email and, until SCRUM-239, answers 503 CODE_SEND_FAILED', async () => {
    const { app, prisma, post } = await boot();
    try {
      const response = await post(CREATOR).expect(503);

      expect(response.body).toEqual({ code: 'CODE_SEND_FAILED' });
      expect(prisma.stored[0].codeHash).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      await app.close();
    }
  });
});
