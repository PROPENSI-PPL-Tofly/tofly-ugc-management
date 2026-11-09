import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

// The login_codes table itself (PBI-39, SCRUM-240): what the database refuses on its own, whatever
// the code above it does. Its API-role grants and RLS are held by data-api-access.e2e-spec.ts.

const HASH = randomBytes(32).toString('hex');
const NOW = new Date();
const LATER = new Date(NOW.getTime() + 10 * 60_000);

describe('login_codes (e2e)', () => {
  const prisma = new PrismaClient();
  const email = `e2e-${randomUUID()}@example.com`;

  afterAll(async () => {
    await prisma.$executeRaw`delete from login_codes where email = ${email}`;
    await prisma.$disconnect();
  });

  /** Inserts one row with the given columns over a valid default; answers the error, if any. */
  async function insert(columns: Record<string, unknown>): Promise<unknown> {
    const row = {
      email,
      code_hash: HASH,
      expires_at: LATER,
      created_at: NOW,
      ...columns,
    };
    return prisma.$executeRaw`
      insert into login_codes (email, code_hash, expires_at, created_at, attempts)
      values (${row.email}, ${row.code_hash}, ${row.expires_at}, ${row.created_at},
              ${(row as { attempts?: number }).attempts ?? 0})`
      .then(() => null)
      .catch((error: unknown) => error);
  }

  it('stores a valid row with a generated id, no attempts and no use yet', async () => {
    expect(await insert({})).toBeNull();
    const [row] = await prisma.$queryRaw<
      { id: string; attempts: number; used_at: Date | null }[]
    >`select id, attempts, used_at from login_codes where email = ${email}`;
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row.attempts).toBe(0);
    expect(row.used_at).toBeNull();
  });

  it.each([
    ['an email that is not lower-case', { email: 'Mixed@Example.com' }],
    ['an email with surrounding spaces', { email: ' a@example.com' }],
    [
      'an email longer than 254 characters',
      { email: `${'a'.repeat(243)}@example.com` },
    ],
    ['a plain code instead of a hash', { code_hash: '123456' }],
    ['a hash that is not lower-case hex', { code_hash: HASH.toUpperCase() }],
    ['negative attempts', { attempts: -1 }],
    ['more attempts than a code allows', { attempts: 6 }],
    [
      'an expiry before its creation',
      { expires_at: new Date(NOW.getTime() - 1) },
    ],
  ])('refuses %s', async (_, columns) => {
    expect(String(await insert(columns))).toMatch(/violates check constraint/);
  });

  it('accepts the fifth and last wrong attempt', async () => {
    expect(await insert({ attempts: 5 })).toBeNull();
  });

  it('indexes rows by email, newest first, for the rate limit and the newest-code lookup', async () => {
    const [index] = await prisma.$queryRaw<{ indexdef: string }[]>`
      select indexdef from pg_indexes
      where tablename = 'login_codes' and indexname = 'login_codes_email_created_at_idx'`;
    expect(index.indexdef).toContain('(email, created_at DESC)');
  });
});
