import { PrismaClient } from '@prisma/client';
import { CONTENT_STATUSES } from '../src/contents/content-lifecycle.js';

/**
 * The status a content row may hold is decided by Postgres, not by the backend: whatever the
 * code believes, the enum is what a write is checked against. These cases read the catalog so
 * the database and content-lifecycle.ts cannot drift apart unnoticed (SCRUM-146).
 */
describe('content_status in Postgres (e2e)', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('holds exactly the six lifecycle statuses, in lifecycle order', async () => {
    const rows = await prisma.$queryRaw<{ enumlabel: string }[]>`
      select e.enumlabel
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
      where t.typname = 'content_status'
      order by e.enumsortorder`;

    expect(rows.map((row) => row.enumlabel)).toEqual([...CONTENT_STATUSES]);
  });

  it('refuses the removed Draft Revised as a status', async () => {
    await expect(
      prisma.$queryRaw`select 'draft_revised'::content_status`,
    ).rejects.toThrow(/invalid input value for enum content_status/);
  });

  it('accepts Pending as a status', async () => {
    const [row] = await prisma.$queryRaw<{ status: string }[]>`
      select 'pending'::content_status::text as status`;

    expect(row.status).toBe('pending');
  });

  it('leaves no old status type behind', async () => {
    const rows = await prisma.$queryRaw<{ typname: string }[]>`
      select typname from pg_type where typname like 'content_status%' order by typname`;

    expect(rows.map((row) => row.typname)).toEqual(['content_status']);
  });

  it('still schedules new content by default', async () => {
    const [column] = await prisma.$queryRaw<{ column_default: string }[]>`
      select column_default
      from information_schema.columns
      where table_schema = 'public' and table_name = 'contents' and column_name = 'status'`;

    expect(column.column_default).toBe("'scheduled'::content_status");
  });

  // Pending says the same thing, so the flag would be a second source of truth.
  it('no longer has the is_proposal flag on contents', async () => {
    const rows = await prisma.$queryRaw<{ column_name: string }[]>`
      select column_name
      from information_schema.columns
      where table_schema = 'public' and table_name = 'contents' and column_name = 'is_proposal'`;

    expect(rows).toEqual([]);
  });

  it('holds no content row outside the six statuses', async () => {
    const rows = await prisma.$queryRaw<{ status: string }[]>`
      select distinct status::text as status from contents`;

    const known: readonly string[] = CONTENT_STATUSES;
    expect(rows.filter((row) => !known.includes(row.status))).toEqual([]);
  });
});
