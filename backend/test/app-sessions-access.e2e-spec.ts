import { createHash, randomBytes } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const MARKER = 'e2e-session-access';

/**
 * Supabase's Data API reaches the database as `anon` (anyone holding the project's public
 * key) or `authenticated`. Only the backend may touch sessions: a session row someone else
 * could write, with a hash of an id they chose, would be a signed-in session for any user.
 */
describe('app_sessions from the Supabase API roles (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userId: string;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    userId = (
      await prisma.users.create({
        data: { email: `${MARKER}-admin@example.com`, is_admin: true },
      })
    ).id;
    // A live session the backend created, which no API role may read.
    await prisma.app_sessions.create({
      data: {
        idHash: createHash('sha256').update(MARKER).digest('hex'),
        userId,
        role: 'admin',
        idleExpiresAt: new Date(Date.now() + 60_000),
        absoluteExpiresAt: new Date(Date.now() + 60_000),
      },
    });
  });

  afterAll(async () => {
    await prisma.users.deleteMany({ where: { email: { startsWith: MARKER } } });
    await app.close();
  });

  /** Runs `sql` as the given API role inside a transaction that is always rolled back. */
  async function asRole(role: 'anon' | 'authenticated', sql: string) {
    return prisma
      .$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`set local role ${role}`);
        const rows = await tx.$queryRawUnsafe<unknown[]>(sql);
        throw Object.assign(new Error('rollback'), { rows });
      })
      .catch((error: Error & { rows?: unknown[] }) => error);
  }

  it.each(['anon', 'authenticated'] as const)(
    'refuses %s a session row of its own making',
    async (role) => {
      const idHash = createHash('sha256')
        .update(randomBytes(32).toString('base64url'))
        .digest('hex');

      const result = await asRole(
        role,
        `insert into app_sessions (id_hash, user_id, role, idle_expires_at, absolute_expires_at)
         values ('${idHash}', '${userId}', 'admin', now() + interval '1 hour', now() + interval '1 hour')
         returning id_hash`,
      );

      expect(result.message).not.toBe('rollback');
      expect(result.message).toMatch(/permission denied|row-level security/);
    },
  );

  it.each(['anon', 'authenticated'] as const)(
    'shows %s none of the stored session hashes',
    async (role) => {
      const result = await asRole(role, 'select id_hash from app_sessions');

      expect(
        result.message === 'rollback' ? result.rows : result.message,
      ).toSatisfy(
        (answer: unknown) =>
          (Array.isArray(answer) && answer.length === 0) ||
          /permission denied/.test(String(answer)),
      );
    },
  );
});
