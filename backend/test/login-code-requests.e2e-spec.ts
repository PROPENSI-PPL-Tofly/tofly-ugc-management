import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

// The login_code_requests table itself (PBI-39 AC 5, SCRUM-240): one row per code request that
// was let through, sent or not, so a failed email still counts towards the hourly limit. Its
// API-role grants and RLS are held by data-api-access.e2e-spec.ts.

describe('login_code_requests (e2e)', () => {
  const prisma = new PrismaClient();
  const email = `e2e-${randomUUID()}@example.com`;

  afterAll(async () => {
    await prisma.$executeRaw`delete from login_code_requests where email = ${email}`;
    await prisma.$disconnect();
  });

  /** Inserts one row for the email; answers the error, if any. */
  function insert(value: string): Promise<unknown> {
    return prisma.$executeRaw`
      insert into login_code_requests (email, requested_at) values (${value}, now())`
      .then(() => null)
      .catch((error: unknown) => error);
  }

  it('stores a request with a generated id', async () => {
    expect(await insert(email)).toBeNull();
    const [row] = await prisma.$queryRaw<{ id: string }[]>`
      select id from login_code_requests where email = ${email}`;
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it.each([
    ['an email that is not lower-case', 'Mixed@Example.com'],
    ['an email with surrounding spaces', ' a@example.com'],
    ['an email longer than 254 characters', `${'a'.repeat(243)}@example.com`],
  ])('refuses %s', async (_, value) => {
    expect(String(await insert(value))).toMatch(/violates check constraint/);
  });

  it.each([
    [
      'by email, newest first, for counting one email’s hour',
      'login_code_requests_email_requested_at_idx',
      '(email, requested_at DESC)',
    ],
    [
      'by time alone, for removing requests older than the hour',
      'login_code_requests_requested_at_idx',
      '(requested_at)',
    ],
  ])('indexes requests %s', async (_, name, columns) => {
    const [index] = await prisma.$queryRaw<{ indexdef: string }[]>`
      select indexdef from pg_indexes
      where tablename = 'login_code_requests' and indexname = ${name}`;
    expect(index.indexdef).toContain(columns);
  });
});
