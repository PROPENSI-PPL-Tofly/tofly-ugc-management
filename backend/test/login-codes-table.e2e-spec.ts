import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const MARKER = 'e2e-login-codes-table';
const EMAIL = `${MARKER}@example.com`;
const HASH = 'a'.repeat(64);

/** login_codes (PBI-39, SCRUM-240): only hashes, lower-cased emails, and the backend alone. */
describe('login_codes (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterEach(async () => {
    await prisma.login_codes.deleteMany({
      where: { email: { startsWith: MARKER } },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  function insert(fields: Record<string, string> = {}) {
    const row = {
      email: `'${EMAIL}'`,
      code_hash: `'${HASH}'`,
      expires_at: `now() + interval '10 minutes'`,
      ...fields,
    };
    return prisma.$executeRawUnsafe(
      `insert into login_codes (${Object.keys(row).join(', ')})
       values (${Object.values(row).join(', ')})`,
    );
  }

  it('stores a new code with no attempts, unused, stamped now', async () => {
    const before = new Date(Date.now() - 1000);

    const row = await prisma.login_codes.create({
      data: {
        email: EMAIL,
        codeHash: HASH,
        expiresAt: new Date(Date.now() + 600_000),
      },
    });

    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row.attempts).toBe(0);
    expect(row.usedAt).toBeNull();
    expect(row.createdAt.getTime()).toBeGreaterThan(before.getTime());
  });

  it.each([
    ['a six-digit code', `'123456'`],
    ['a hash in upper case', `'${'A'.repeat(64)}'`],
    ['a hash one character short', `'${'a'.repeat(63)}'`],
  ])('refuses %s as code_hash, so no code is stored in the clear', async (_label, value) => {
    await expect(insert({ code_hash: value })).rejects.toThrow(
      /login_codes_code_hash_check/,
    );
  });

  it('refuses an email that is not lower-cased, so verify finds every code', async () => {
    await expect(
      insert({ email: `'${MARKER.toUpperCase()}@example.com'` }),
    ).rejects.toThrow(/login_codes_email_check/);
  });

  it.each(['-1', '6'])('refuses %s attempts', async (attempts) => {
    await expect(insert({ attempts })).rejects.toThrow(
      /login_codes_attempts_check/,
    );
  });

  it('accepts the fifth wrong attempt, which ends the code', async () => {
    await expect(insert({ attempts: '5' })).resolves.toBe(1);
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
    'refuses %s any read or write',
    async (role) => {
      await insert();

      const read = await asRole(role, 'select code_hash from login_codes');
      const write = await asRole(
        role,
        `insert into login_codes (email, code_hash, expires_at)
         values ('${EMAIL}', '${HASH}', now()) returning id`,
      );

      expect(read.message).toMatch(/permission denied/);
      expect(write.message).toMatch(/permission denied/);
    },
  );
});
